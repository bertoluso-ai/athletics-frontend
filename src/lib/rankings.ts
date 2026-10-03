import { unstable_cache } from "next/cache";
import { pgQuery } from "./pg";
import { AGE_CATEGORIES } from "./queries";

// Individual ranking (all disciplines, our points), after the
// ProCyclingStats ranking page. Three views:
//   season  -- points of the selected season
//   rolling -- points over the last 365 days (PCS's main ranking)
//   wins    -- ordered by wins, points as tie-break
// Movement (Prev / Diff) compares with the same ranking computed as of 14
// days before the latest result in the data -- only meaningful for rolling
// and for the current season.

export type RankingView = "season" | "rolling" | "wins";

export type IndividualRankingRow = {
  rank: number;
  prev_rank: number | null;
  athlete_id: string;
  display_name: string;
  nationality: string | null;
  birth_year: number | null;
  points: number;
  wins: number;
  main_event: string | null;
  best_mark: string | null; // best wind-legal mark (discipline view)
};

export type RankingParams = {
  view: RankingView;
  gender: "Men" | "Women";
  year: number;
  nationality?: string; // one code...
  nationalityCodes?: string[]; // ...or every code of that country (sources disagree: NED/NET/NLD)
  age?: string;
  event?: string; // one discipline only
  sortBy?: "points" | "mark";
  area?: string; // World Athletics area (AFR, ASI, EUR, NAC, SAM, OCE) // discipline view: rank by best mark instead
  page: number;
  pageSize: number;
};


// /rankings reads searchParams for every filter, which makes Next.js treat
// the whole route as dynamic and skip its own `export const revalidate` --
// this full-table scan/rank query was recomputing from scratch on every
// single request (multi-second). unstable_cache keys on the actual params,
// so repeat requests for the same filter combination hit a real cache.
export const getIndividualRanking = unstable_cache(
  async (p: RankingParams) => fetchIndividualRanking(p),
  ["individual-ranking-v1"],
  { revalidate: 3600 }
);

// Fast path against individual_ranking_cache (see
// athletics-database/serving/schema.sql's comment on that table, and
// matchAthletesIncremental/refresh_ranking_cache.py which builds it
// nightly) -- the common case (no age/event filter, current season or
// rolling) reads a ~100K-row precomputed+indexed table instead of
// aggregating+ranking the full ~5M-row `events` table on every request.
// Confirmed live: nationality/area filtering used to pay that full cost
// regardless of the filter (it only narrows the result at the very end,
// since a filtered row must still show its real world rank) -- this is
// the fix for that. Age/event-filtered requests fall back to the live
// query below (rarer combination, and age/event narrow `base` itself so
// they're not paying the *unfiltered* full-table cost anyway).
function fetchIndividualRankingCached(p: RankingParams) {
  const scope = p.view === "rolling" ? "rolling" : "season";
  const byWins = p.view === "wins";
  const rankCol = byWins ? "rank_wins" : "rank_points";
  const prevRankCol = byWins ? "prev_rank_wins" : "prev_rank_points";
  const offset = (p.page - 1) * p.pageSize;

  const params: unknown[] = [scope, p.gender];
  let i = 2;
  const yearFilter = scope === "season" ? `AND year = $${++i}` : "AND year IS NULL";
  if (scope === "season") params.push(p.year);

  let natFilter = "";
  if (p.nationalityCodes?.length) { natFilter = `AND nationality = ANY($${++i})`; params.push(p.nationalityCodes); }
  else if (p.nationality) { natFilter = `AND nationality = $${++i}`; params.push(p.nationality); }
  const areaFilter = p.area ? `AND nationality IN (SELECT code FROM countries WHERE area = $${++i})` : "";
  if (p.area) params.push(p.area);

  const sql = `
    SELECT athlete_id, display_name, nationality, birth_year,
      points, wins, main_event, best_mark,
      ${rankCol} AS rank, ${prevRankCol} AS prev_rank,
      COUNT(*) OVER () AS total
    FROM individual_ranking_cache
    WHERE scope = $1 AND gender = $2 ${yearFilter} ${natFilter} ${areaFilter}
      AND ${rankCol} IS NOT NULL
    ORDER BY ${rankCol}
    LIMIT ${p.pageSize} OFFSET ${offset}
  `;
  return pgQuery<IndividualRankingRow & { total: number }>(sql, params);
}

// Ported to Postgres against the `events` mirror table (see
// athletics-database/serving/schema.sql) -- BigQuery's ~1-2s per-query
// floor applied here too even though this already filtered on
// events_enriched's clustering columns (gender, year); it's the single
// heaviest query on the site (podium + climbers + paginated table, 3
// separate calls per page load). Postgres doesn't have BigQuery's
// ARRAY_AGG(... LIMIT 1)/IGNORE NULLS/SAFE_CAST/DATE_SUB -- translated to
// ARRAY_AGG(...) FILTER (WHERE ...) + array indexing, a regex-guarded cast,
// and interval arithmetic respectively.
function fetchIndividualRankingPg(p: RankingParams) {
  const ageMax = p.age ? AGE_CATEGORIES[p.age] : undefined;
  const ageSql = ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : "";
  const byMark = p.sortBy === "mark" && !!p.event;
  const order = byMark ? "best_v ASC, points DESC" : p.view === "wins" ? "wins DESC, points DESC" : "points DESC";
  const offset = (p.page - 1) * p.pageSize;
  const rolling = p.view === "rolling";

  // raw_v: the mark's own magnitude (always positive for a real
  // performance) -- used only to tell a real mark from DNS/NM/DNF (which
  // have no numeric mark at all). best_v: signed for sorting (field marks
  // negated, since further/higher is better but ascending sort assumes
  // lower is better).
  const safeMark = `CASE WHEN mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN mark::double precision ELSE NULL END`;
  const rawV = `CASE WHEN athletics_discipline IN ('Jumps', 'Throws', 'Combined Events') THEN ${safeMark} ELSE mark_seconds END`;
  const bestV = `CASE WHEN athletics_discipline IN ('Jumps', 'Throws', 'Combined Events') THEN -(${safeMark}) ELSE mark_seconds END`;

  // $2 (year) is only ever referenced in the season-view branches below --
  // rolling's windows are date-arithmetic off `latest.d` instead. Postgres
  // infers a prepared statement's parameter count from the highest $N
  // actually present in the SQL text, so always binding a year value here
  // even when rolling never references $2 threw "bind message supplies 2
  // parameters, but prepared statement requires 1" (caught live). Only
  // push it onto `params` when the SQL will actually contain a $2.
  const params: unknown[] = [p.gender];
  let i = 1;
  const yearParam = rolling ? "" : `$${++i}`;
  if (!rolling) params.push(p.year);

  const nowWin = rolling
    ? `date > latest.d - INTERVAL '365 days' AND date <= latest.d`
    : `year = ${yearParam}`;
  const prevWin = rolling
    ? `date > (latest.d - INTERVAL '14 days') - INTERVAL '365 days' AND date <= latest.d - INTERVAL '14 days'`
    : `year = ${yearParam} AND date <= latest.d - INTERVAL '14 days'`;

  const filters: string[] = [];
  if (p.event) { filters.push(`AND athletics_event = $${++i}`); params.push(p.event); }

  let natFilter = "";
  if (p.nationalityCodes?.length) { natFilter = `AND r.nationality = ANY($${++i})`; params.push(p.nationalityCodes); }
  else if (p.nationality) { natFilter = `AND r.nationality = $${++i}`; params.push(p.nationality); }
  const areaFilter = p.area ? `AND r.nationality IN (SELECT code FROM countries WHERE area = $${++i})` : "";
  if (p.area) params.push(p.area);

  const sql = `
    WITH latest AS (SELECT MAX(date) AS d FROM events WHERE date <= CURRENT_DATE),
    base AS (
      SELECT athlete_id, athlete_display_name, nationality, birth_year, date, year,
        competition_score, place, athletics_event, athletics_discipline, wind_legal, mark_display, mark, mark_seconds
      FROM events
      WHERE gender = $1 AND athlete_id IS NOT NULL ${ageSql}
        ${byMark ? "" : "AND competition_score IS NOT NULL"}
        ${filters.join(" ")}
    ),
    now_agg AS (
      SELECT athlete_id,
        (ARRAY_AGG(athlete_display_name))[1] AS display_name,
        (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
        (ARRAY_AGG(birth_year) FILTER (WHERE birth_year IS NOT NULL))[1] AS birth_year,
        ROUND(SUM(competition_score)::numeric, 0) AS points,
        COUNT(*) FILTER (WHERE place = 1) AS wins,
        (ARRAY_AGG(athletics_event ORDER BY competition_score DESC))[1] AS main_event,
        (ARRAY_AGG(mark_display ORDER BY ${bestV} ASC)
          FILTER (WHERE COALESCE(wind_legal, TRUE) AND ${rawV} > 0))[1] AS best_mark,
        MIN(CASE WHEN COALESCE(wind_legal, TRUE) THEN ${bestV} END) AS best_v
      FROM base, latest
      WHERE ${nowWin}
      GROUP BY athlete_id
    ),
    prev_agg AS (
      SELECT athlete_id, SUM(competition_score) AS points, COUNT(*) FILTER (WHERE place = 1) AS wins,
        MIN(CASE WHEN COALESCE(wind_legal, TRUE) THEN ${bestV} END) AS best_v
      FROM base, latest
      WHERE ${prevWin}
      GROUP BY athlete_id
    ),
    ranked AS (
      SELECT n.*, RANK() OVER (ORDER BY ${order}) AS rank
      FROM now_agg n
      ${byMark ? "WHERE n.best_v IS NOT NULL" : ""}
    ),
    prev_ranked AS (
      SELECT athlete_id, RANK() OVER (ORDER BY ${order}) AS prev_rank FROM prev_agg
      WHERE ${byMark ? "best_v IS NOT NULL" : "points > 0"}
    ),
    joined AS (
      SELECT r.*, pr.prev_rank
      FROM ranked r LEFT JOIN prev_ranked pr USING (athlete_id)
      WHERE TRUE ${natFilter} ${areaFilter}
    )
    SELECT *, COUNT(*) OVER () AS total FROM joined
    ORDER BY rank
    LIMIT ${p.pageSize} OFFSET ${offset}
  `;
  return pgQuery<IndividualRankingRow & { total: number }>(sql, params);
}

async function fetchIndividualRanking(p: RankingParams) {
  const currentYear = new Date().getFullYear();
  const cacheEligible =
    !p.age && !p.event && (p.view === "rolling" || p.year === currentYear);
  const rows = cacheEligible ? await fetchIndividualRankingCached(p) : await fetchIndividualRankingPg(p);
  return { rows, total: rows[0]?.total ?? 0 };
}

// Movement only makes sense where the ranking is still moving.
export function hasMovement(view: RankingView, year: number, currentYear: number) {
  return view === "rolling" || year === currentYear;
}

// One entry per country NAME: the sources use several codes for the same
// country (NED/NET/NLD, SUI/SWI/CHE, RSA/SAF/ZAF...). `code` is the most
// used one (the option value), `codes` all of them (for filtering).
// Cached -- same sequential-round-trip issue as getCalendarYears: cheap on
// BigQuery's side but the page awaited this (and getRankingYears) one after
// another before even starting the main ranking query.
export const getRankingNationalities = unstable_cache(
  async (gender: string): Promise<{ code: string; name: string; codes: string[]; area: string | null }[]> => fetchRankingNationalities(gender),
  ["ranking-nationalities-v2"],
  { revalidate: 3600 }
);

async function fetchRankingNationalities(gender: string): Promise<{ code: string; name: string; codes: string[]; area: string | null }[]> {
  return pgQuery(
    `
    WITH codes AS (
      SELECT nationality AS code, COUNT(*) AS n FROM events
      WHERE gender = $1 AND nationality IS NOT NULL AND TRIM(nationality) != '' AND competition_score IS NOT NULL
      GROUP BY 1
    )
    SELECT COALESCE(n.name, c.code) AS name,
      (ARRAY_AGG(c.code ORDER BY c.n DESC))[1] AS code,
      ARRAY_AGG(c.code ORDER BY c.n DESC) AS codes,
      (ARRAY_AGG(n.area) FILTER (WHERE n.area IS NOT NULL))[1] AS area
    FROM codes c LEFT JOIN countries n USING (code)
    WHERE COALESCE(n.name, '') NOT IN ('Unknown', 'Asia', 'Oceania', 'Africa', 'Europe', 'Americas')
    GROUP BY 1
    ORDER BY name
  `,
    [gender]
  );
}

export const getRankingYears = unstable_cache(
  async (): Promise<number[]> => {
    const rows = await pgQuery<{ year: number }>(`
      SELECT DISTINCT year FROM events WHERE competition_score IS NOT NULL AND year IS NOT NULL ORDER BY year DESC
    `);
    return rows.map((r) => r.year);
  },
  ["ranking-years-v1"],
  { revalidate: 3600 }
);
