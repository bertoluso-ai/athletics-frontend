import { unstable_cache } from "next/cache";
import { runQuery } from "./bigquery";

// Season calendar: competitions already held (from results, with their
// headline performance) plus the ones still to come (from the scraped World
// Athletics calendar, tablasauxiliares.upcoming_competitions), in one list.

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
  // past only: best-scored performance of the meet
  top_athlete_id: string | null;
  top_athlete: string | null;
  top_nationality: string | null;
  top_event: string | null;
  top_mark: string | null;
  level: number | null; // past only: field strength of this edition, 0-100, tier-anchored (see registry/16_compute_race_level.sql)
  // upcoming only
  disciplines: string | null;
};

// getCalendar's "all-time rank" CTE ranks every past winner against the
// FULL history of events_enriched (4.6M+ rows) -- correct (it's meant to
// compare across all years), but expensive, and this page reads
// searchParams (year/tier/month/sort/dir), which makes Next.js treat the
// whole route as dynamic and skip its own `export const revalidate` --
// every request recomputed this from scratch (5-9s). unstable_cache keys
// on the actual params instead, so repeat requests for the same
// year/tiers/month are genuinely cached regardless of the route being
// dynamic.
export const getCalendar = unstable_cache(
  async (
    year: number,
    tiers: string[],
    month?: number,
    sort: "date" | "name" | "tier" = "date",
    dir: "asc" | "desc" = "asc"
  ): Promise<CalendarRow[]> => fetchCalendar(year, tiers, month, sort, dir),
  ["calendar-v1"],
  { revalidate: 3600 }
);

async function fetchCalendar(
  year: number,
  tiers: string[],
  month?: number,
  sort: "date" | "name" | "tier" = "date",
  dir: "asc" | "desc" = "asc"
): Promise<CalendarRow[]> {
  const monthFilter = (col: string) => (month ? `AND EXTRACT(MONTH FROM ${col}) = ${month}` : "");
  // Marks as one comparable number, lower = better (field marks negated),
  // wind-legal only, indoor kept apart from outdoor -- same convention as
  // meetStats.ts.
  const V = `IF(athletics_discipline IN ('Jumps', 'Throws', 'Combined Events'), -SAFE_CAST(mark AS FLOAT64), mark_seconds)`;
  const INDOOR = `(IFNULL(track_key, '') = 'Short Track' OR LOWER(event_name) LIKE '%indoor%')`;
  const rows = await runQuery<CalendarRow>(
    `
    WITH base AS (
      SELECT event_name, year,
        MIN(date) AS date_start, MAX(date) AS date_end,
        APPROX_TOP_COUNT(city, 1)[OFFSET(0)].value AS city,
        APPROX_TOP_COUNT(country, 1)[OFFSET(0)].value AS country,
        ARRAY_AGG(division_key_resolved IGNORE NULLS
          ORDER BY \`athletics-database.registry.tier_rank\`(division_key_resolved) LIMIT 1)[SAFE_OFFSET(0)] AS tier,
        COUNT(DISTINCT CONCAT(athletics_event, gender)) AS n_events
      FROM \`athletics-database.athletics_all.events_enriched\`
      -- older sources (sports123) have no dates: keep those editions, undated
      WHERE year = @year ${monthFilter("date")}
      GROUP BY event_name, year
    ),
    -- "Top performance" must be comparable across disciplines, so it can't
    -- use our points (a flat win bonus per tier: every winner of a given
    -- tier ties on it regardless of event -- 100m and 1500m winners both
    -- score the same -- so picking by points is close to arbitrary among a
    -- meeting's many winners, and, worse, can pick a weaker parallel B/C
    -- section's winner over the real final's, since both show place = 1).
    -- Ranking each winner's mark against the FULL history of that exact
    -- discipline+gender (one pass over the whole table) gives a measure
    -- that means the same thing in every event, and naturally favours the
    -- real final's winner over a weaker section sharing the same meet.
    ranks AS (
      SELECT event_row_key, RANK() OVER (PARTITION BY athletics_event, gender, indoor ORDER BY v) AS all_time_rank
      FROM (
        SELECT event_row_key, athletics_event, gender, ${INDOOR} AS indoor, ${V} AS v
        FROM \`athletics-database.athletics_all.events_enriched\`
        WHERE IFNULL(wind_legal, TRUE)
      )
      WHERE v IS NOT NULL AND v != 0
    ),
    winners AS (
      SELECT e.event_name, e.year, e.athlete_id, e.athlete_display_name, e.nationality, e.athletics_event, e.mark_display,
        r.all_time_rank
      FROM \`athletics-database.athletics_all.events_enriched\` e
      JOIN ranks r USING (event_row_key)
      -- Relay team rows: source parsing bug concatenates all 4 legs' names
      -- with no separator (e.g. "...Hull Australiaoliver Hoare..."), so
      -- they can never be a readable/comparable "top performance" pick.
      WHERE e.year = @year AND e.place = 1 AND e.athlete_id IS NOT NULL
        AND e.athletics_discipline != 'Relays' ${monthFilter("e.date")}
    ),
    tops AS (
      SELECT event_name, year,
        ARRAY_AGG(STRUCT(athlete_id, athlete_display_name, nationality, athletics_event, mark_display)
          ORDER BY all_time_rank LIMIT 1)[SAFE_OFFSET(0)] AS top
      FROM winners
      GROUP BY event_name, year
    ),
    editions AS (
      SELECT b.*, t.top, cl.competition_level
      FROM base b
      LEFT JOIN tops t USING (event_name, year)
      LEFT JOIN \`athletics-database.registry.competition_level\` cl USING (event_name, year)
    ),
    past AS (
      SELECT 'past' AS kind, CAST(date_start AS STRING) AS date_start, CAST(date_end AS STRING) AS date_end,
        event_name AS name, city, country, tier, n_events,
        top.athlete_id AS top_athlete_id, top.athlete_display_name AS top_athlete,
        top.nationality AS top_nationality, top.athletics_event AS top_event, top.mark_display AS top_mark,
        -- The raw 0-100 score, not its percentile: race_level/competition_level
        -- is now tier-anchored (70% the race's own competition tier, 30% a
        -- mark-quality modifier -- see registry/16_compute_race_level.sql), so
        -- it already reads on an absolute, intuitive scale. Its percentile
        -- would re-introduce the exact illusion this design replaced: a tier-B
        -- national final still ranks above ~95% of ALL races ever (most of
        -- which are tier E/F club meets), so showing THAT number back would
        -- make a national championship look elite again, which is the
        -- complaint that caused this rework in the first place.
        competition_level AS level,
        CAST(NULL AS STRING) AS disciplines
      FROM editions
      WHERE tier IN UNNEST(@tiers)
    ),
    upcoming AS (
      SELECT 'upcoming' AS kind, CAST(date_start AS STRING), CAST(date_end AS STRING),
        name, REGEXP_EXTRACT(venue, r',\\s*([^,(]+?)\\s*\\(') AS city, country, category AS tier,
        CAST(NULL AS INT64) AS n_events,
        CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
        CAST(NULL AS FLOAT64) AS level,
        disciplines
      FROM \`athletics-database.tablasauxiliares.upcoming_competitions\`
      WHERE EXTRACT(YEAR FROM date_start) = @year
        AND date_start > (SELECT IFNULL(MAX(date), DATE '1900-01-01') FROM \`athletics-database.athletics_all.events_enriched\`)
        AND category IN UNNEST(@tiers) ${monthFilter("date_start")}
    )
    SELECT * FROM past
    UNION ALL
    SELECT * FROM upcoming
    ORDER BY date_start IS NULL, date_start, name
  `,
    { year, tiers }
  );

  const cmp: Record<typeof sort, (a: CalendarRow, b: CalendarRow) => number> = {
    date: (a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""),
    name: (a, b) => a.name.localeCompare(b.name),
    tier: (a, b) => TIER_ORDER.indexOf(a.tier as never) - TIER_ORDER.indexOf(b.tier as never),
  };
  rows.sort(cmp[sort]);
  if (dir === "desc") rows.reverse();
  return rows;
}

// Cheap on BigQuery's own side (<1s) but every call is still a full
// client<->BigQuery round trip -- cached so a Calendar page load only pays
// that cost once per hour instead of on every single request alongside
// getCalendar's own round trip (the two were run sequentially, doubling
// the page's network latency).
export const getCalendarYears = unstable_cache(
  async (): Promise<number[]> => {
    const rows = await runQuery<{ year: number }>(`
      SELECT DISTINCT year FROM \`athletics-database.athletics_all.events_enriched\` WHERE year IS NOT NULL
      UNION DISTINCT
      SELECT DISTINCT EXTRACT(YEAR FROM date_start) FROM \`athletics-database.tablasauxiliares.upcoming_competitions\`
      ORDER BY year DESC
    `);
    return rows.map((r) => r.year);
  },
  ["calendar-years-v1"],
  { revalidate: 3600 }
);
