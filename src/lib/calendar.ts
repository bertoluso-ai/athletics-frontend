import { unstable_cache } from "next/cache";
import { pgQuery } from "./pg";
import { eventCategory } from "./events";

// Season calendar: competitions already held (with their headline
// performance) plus the ones still to come, in one list.
//
// Reads the Postgres serving tables precomputed nightly by
// athletics-database/matchAthletesIncremental/registry/26_materialize_calendar.sql
// (calendar_editions / calendar_winners / calendar_upcoming). This page used
// to query BigQuery directly on every cache miss -- ranking every mark in
// history to pick each meet's "top performance" (~2.5s and BigQuery cost per
// filter combination) -- which the new discipline / area / nation / date-range
// filters would have multiplied.

export const TIER_ORDER = ["OW", "DF", "GW", "GL", "A", "B", "C", "D", "E", "F"] as const;

export type CalendarRow = {
  kind: "past" | "upcoming";
  date_start: string | null; // null: the source gives only the year
  date_end: string | null;
  name: string;
  city: string | null;
  country: string | null;
  tier: string | null;
  n_events: number | null;
  // past only: the meet's headline performance (its winner whose mark ranks
  // best all-time in its own discipline) -- or, with a discipline filter, that
  // discipline's best winner
  top_athlete_id: string | null;
  top_athlete: string | null;
  top_nationality: string | null;
  top_event: string | null; // raw athletics_event, for the /meets deep link
  top_gender: string | null;
  top_mark: string | null;
  level: number | null; // past only: competition quality (registry/16 competition_level)
  // upcoming only
  disciplines: string | null;
  past_event_name: string | null; // most recent past edition, for the link
};

export type CalendarSort = "date" | "name" | "tier" | "quality";

export type CalendarFilters = {
  year: number;
  months: number[]; // empty = whole year
  tiers: string[];
  discipline?: string; // athletics_event_base
  area?: string; // World Athletics area of the host country
  nation?: string; // host country code
  from?: string; // YYYY-MM-DD; a from/to range replaces year+months
  to?: string;
  sort: CalendarSort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

// Upcoming competitions only carry coarse categories ("Track and Field",
// "Road Running", ...), so a discipline filter matches them by category.
const UPCOMING_CATEGORY: Record<string, string> = {
  Road: "Road Running",
  "Cross Country": "Cross Country",
  Combined: "Combined Events",
  "Race Walk": "Race Walking",
};

async function _getCalendar(f: CalendarFilters): Promise<{ rows: CalendarRow[]; total: number }> {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const ranged = !!(f.from || f.to);
  const tiersPh = p(f.tiers);
  const pastWhere: string[] = [`e.tier = ANY(${tiersPh}::text[])`];
  const upWhere: string[] = [`u.tier = ANY(${tiersPh}::text[])`, `u.date_start > (SELECT MAX(date) FROM events)`];

  if (ranged) {
    // Starts in the range, or a real multi-day meet (<= 31 days) overlapping
    // it. An "edition" is event_name + year, so a recurring name reused all
    // year (e.g. "Christmas Cup") spans months and would otherwise match any
    // range. Undated (year-only) editions can't be placed.
    const fromPh = p(f.from ?? "0001-01-01");
    const toPh = p(f.to ?? "9999-12-31");
    for (const [w, a] of [[pastWhere, "e"], [upWhere, "u"]] as const) {
      w.push(`(${a}.date_start BETWEEN ${fromPh}::date AND ${toPh}::date
        OR (${a}.date_start <= ${toPh}::date AND ${a}.date_end >= ${fromPh}::date AND ${a}.date_end - ${a}.date_start <= 31))`);
    }
  } else {
    const yearPh = p(f.year);
    pastWhere.push(`e.year = ${yearPh}`);
    upWhere.push(`EXTRACT(YEAR FROM u.date_start) = ${yearPh}`);
    if (f.months.length) {
      const mPh = p(f.months);
      pastWhere.push(`EXTRACT(MONTH FROM e.date_start) = ANY(${mPh}::int[])`);
      upWhere.push(`EXTRACT(MONTH FROM u.date_start) = ANY(${mPh}::int[])`);
    }
  }
  if (f.nation) {
    const nPh = p(f.nation);
    pastWhere.push(`e.country = ${nPh}`);
    upWhere.push(`u.country = ${nPh}`);
  } else if (f.area) {
    const aPh = p(f.area);
    pastWhere.push(`e.country IN (SELECT code FROM countries WHERE area = ${aPh})`);
    upWhere.push(`u.country IN (SELECT code FROM countries WHERE area = ${aPh})`);
  }

  // Discipline: only editions that held it, and their top performance becomes
  // that discipline's best winner.
  let winnersJoin = "";
  const top = (col: string) => `e.top_${col}`;
  let topCols = `${top("athlete_id")} AS top_athlete_id, ${top("athlete")} AS top_athlete, ${top("nationality")} AS top_nationality,
      ${top("event")} AS top_event, ${top("gender")} AS top_gender, ${top("mark")} AS top_mark`;
  if (f.discipline) {
    const dPh = p(f.discipline);
    winnersJoin = `JOIN (
      SELECT DISTINCT ON (event_name, year) event_name, year, athlete_id, athlete_display_name, nationality,
        athletics_event, gender, mark_display
      FROM calendar_winners WHERE athletics_event_base = ${dPh}
      ORDER BY event_name, year, all_time_rank NULLS LAST
    ) w ON w.event_name = e.event_name AND w.year = e.year`;
    topCols = `w.athlete_id AS top_athlete_id, w.athlete_display_name AS top_athlete, w.nationality AS top_nationality,
      w.athletics_event AS top_event, w.gender AS top_gender, w.mark_display AS top_mark`;
    const cat = UPCOMING_CATEGORY[eventCategory(f.discipline)] ?? "Track and Field";
    upWhere.push(`u.disciplines ILIKE ${p(`%${cat}%`)}`);
  }

  const desc = f.dir === "desc";
  const order: Record<CalendarSort, string> = {
    date: `date_start ${desc ? "DESC" : "ASC"} NULLS LAST, name`,
    name: `name ${desc ? "DESC" : "ASC"}`,
    tier: `array_position(ARRAY['OW','DF','GW','GL','A','B','C','D','E','F'], tier) ${desc ? "DESC" : "ASC"} NULLS LAST, date_start`,
    quality: `level ${desc ? "DESC" : "ASC"} NULLS LAST, date_start`,
  };
  const limitPh = p(f.pageSize);
  const offsetPh = p((f.page - 1) * f.pageSize);

  const rows = await pgQuery<CalendarRow & { total: number }>(
    `
    SELECT *, COUNT(*) OVER ()::int AS total FROM (
      SELECT 'past' AS kind, e.date_start::text AS date_start, e.date_end::text AS date_end, e.event_name AS name,
        e.city, e.country, e.tier, e.n_events, ${topCols}, e.level,
        NULL::text AS disciplines, NULL::text AS past_event_name
      FROM calendar_editions e
      ${winnersJoin}
      WHERE ${pastWhere.join(" AND ")}
      UNION ALL
      SELECT 'upcoming', u.date_start::text, u.date_end::text, u.name, u.city, u.country, u.tier, NULL::int,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL::double precision, u.disciplines, u.past_event_name
      FROM calendar_upcoming u
      WHERE ${upWhere.join(" AND ")}
    ) x
    ORDER BY ${order[f.sort]}
    LIMIT ${limitPh} OFFSET ${offsetPh}
  `,
    params
  );
  return { rows, total: rows[0]?.total ?? 0 };
}
export const getCalendar = unstable_cache(_getCalendar, ["calendar-pg-v1"], { revalidate: 3600 });

export const getCalendarYears = unstable_cache(
  async (): Promise<number[]> => {
    const rows = await pgQuery<{ year: number }>(`
      SELECT year FROM calendar_editions WHERE year IS NOT NULL
      UNION
      SELECT EXTRACT(YEAR FROM date_start)::int FROM calendar_upcoming WHERE date_start IS NOT NULL
      ORDER BY year DESC
    `);
    return rows.map((r) => r.year);
  },
  ["calendar-years-pg-v1"],
  { revalidate: 3600 }
);
