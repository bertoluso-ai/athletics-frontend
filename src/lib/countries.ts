import { unstable_cache } from "next/cache";
import { pgQuery } from "./pg";
import { AGE_CATEGORIES, INDOOR_EXPR } from "./queries";
import { EVENT_GROUPS } from "./events";
import { eventMatchesType, eventRaceKind, isRaceType, type RaceType } from "./raceTypes";

// Countries/[code] and Rankings' nation view both read searchParams,
// which makes Next.js treat them as fully dynamic (no Full Route Cache --
// confirmed live via response headers: Cache-Control: no-store on every
// request). The underlying data only changes once a day (the scheduled
// pipeline), so the query functions below are wrapped in Next's Data
// Cache instead -- repeat requests for the same parameters are served
// without hitting Postgres again.
const DAY_CACHE = { revalidate: 3600 };

// Country ranking: a country's points for a season are the sum of the
// season points of its 24 best athletes, per gender (men and women are two
// separate rankings) and optionally per age category (U23/U20/U18, same
// rule as the athlete rankings: age = season - birth year, only results
// scored while inside the category count). An athlete counts for their
// most recent nationality that season. Countries are split in blocks of 8:
// Gold (1-8), Silver (9-16), Bronze (17-24), then the rest.

export type CountryGender = "Men" | "Women";
export const COUNTED_ATHLETES = 24;

export const TIERS = [
  { key: "gold", label: "Gold", from: 1, to: 8, color: "text-yellow-600", bg: "bg-yellow-400", border: "border-yellow-400/40" },
  { key: "silver", label: "Silver", from: 9, to: 16, color: "text-neutral-300", bg: "bg-neutral-300", border: "border-neutral-300/40" },
  { key: "bronze", label: "Bronze", from: 17, to: 24, color: "text-orange-500", bg: "bg-orange-500", border: "border-orange-500/40" },
] as const;

export function tierForRank(rank: number) {
  return TIERS.find((t) => rank >= t.from && rank <= t.to) ?? null;
}

export type CountryFilters = { gender: CountryGender; age?: string; type?: RaceType; event?: string };

function ageFilter(age: string | undefined, yearExpr = "year") {
  const max = age ? AGE_CATEGORIES[age] : undefined;
  return max !== undefined ? `AND birth_year IS NOT NULL AND (${yearExpr} - birth_year) <= ${max}` : "";
}


const NAMES_CTE = `
  names AS (
    SELECT code, name FROM countries
  )`;

export type CountryRankingRow = {
  code: string;
  name: string;
  rank: number;
  points: number;
  n_counted: number;
  n_athletes: number;
  wins: number;
  podiums: number;
};

// registry.country_season_points (see matchAthletesIncremental/registry/
// 20_materialize_country_points.sql) replaces the live full-table
// aggregation this used to run on every request -- ranking every country
// for a year needs every athlete's season total regardless of any
// clustering, so the only real fix was precomputing it once a day instead
// of on every page view (139MB/1.7s -> 10MB/0.8s, measured live).
async function _getCountryRanking(year: number, f: CountryFilters): Promise<CountryRankingRow[]> {
  // One discipline or one race type: not precomputed (too many combinations), so the same
  // "24 best athletes per country" rule runs live over `events`, which is stored sorted by
  // discipline+gender+year and indexed on (athletics_event_base, gender, year).
  if (f.event || f.type) return _getCountryRankingFiltered(year, f);
  return pgQuery<CountryRankingRow>(
    `
    SELECT c.code, COALESCE(n.name, c.code) AS name,
      RANK() OVER (ORDER BY c.points DESC) AS rank,
      c.points, c.n_counted, c.n_athletes, c.wins, c.podiums
    FROM country_season_points c
    LEFT JOIN countries n USING (code)
    WHERE c.year = $1 AND c.gender = $2 AND c.age_cat = $3 AND c.points > 0
    ORDER BY rank
  `,
    [year, f.gender, f.age ?? ""]
  );
}

async function _getCountryRankingFiltered(year: number, f: CountryFilters): Promise<CountryRankingRow[]> {
  const catalog = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women] as string[])));
  const events = f.event ? [f.event] : catalog.filter((ev) => !f.type || eventMatchesType(ev, f.type));
  // Outdoor by default, like every other points ranking; Indoor is its own context.
  const trackish = f.type ? f.type === "track" : f.event ? eventRaceKind(f.event) === "track" : false;
  const indoorCond = f.type === "indoor" ? `AND ${INDOOR_EXPR}` : trackish ? `AND NOT ${INDOOR_EXPR}` : "";
  return pgQuery<CountryRankingRow>(
    `
    WITH athletes AS (
      SELECT athlete_id,
        (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
        SUM(competition_score) AS points,
        COUNT(*) FILTER (WHERE place = 1) AS wins,
        COUNT(*) FILTER (WHERE place BETWEEN 1 AND 3) AS podiums
      FROM events
      WHERE year = $1 AND gender = $2 AND athletics_event_base = ANY($3::text[])
        AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
        ${ageFilter(f.age)} ${indoorCond}
      GROUP BY athlete_id
    ),
    ranked AS (
      SELECT nationality AS code, points, wins, podiums,
        ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY points DESC) AS rn
      FROM athletes WHERE nationality IS NOT NULL
    ),
    per_country AS (
      SELECT code,
        ROUND(SUM(points) FILTER (WHERE rn <= ${COUNTED_ATHLETES})::numeric, 0) AS points,
        COUNT(*) FILTER (WHERE rn <= ${COUNTED_ATHLETES}) AS n_counted,
        COUNT(*) AS n_athletes,
        SUM(wins) AS wins, SUM(podiums) AS podiums
      FROM ranked GROUP BY code
    )
    SELECT p.code, COALESCE(n.name, p.code) AS name,
      RANK() OVER (ORDER BY p.points DESC) AS rank,
      p.points, p.n_counted, p.n_athletes, p.wins, p.podiums
    FROM per_country p LEFT JOIN countries n ON n.code = p.code
    WHERE p.points > 0
    ORDER BY rank
  `,
    [year, f.gender, events]
  );
}
export const getCountryRanking = unstable_cache(_getCountryRanking, ["getCountryRanking-v2"], DAY_CACHE);

export type CountryAthleteRow = {
  athlete_id: string;
  display_name: string;
  birth_year: number | null;
  points: number;
  wins: number;
  main_event: string;
  rn_in_country: number;
  counts: boolean;
};

export type CountryResultRow = {
  date: string;
  year: number;
  event_name: string;
  athletics_event: string;
  place: number;
  mark_display: string;
  competition_level: string | null;
  competition_score: number | null;
  athlete_id: string;
  display_name: string;
};

export type CountrySeasonRow = { year: number; points: number; rank: number };

async function _getCountryDetail(code: string, year: number, f: CountryFilters, seasonEvent?: string) {
  // registry.country_results (see matchAthletesIncremental/registry/
  // 20_materialize_country_points.sql) replaces events_enriched for all
  // four queries below -- clustered by (nationality, gender, year), the
  // exact filter this page always applies, instead of events_enriched's
  // (athlete_id, athletics_event, gender, year) which doesn't help a
  // nationality-keyed page at all (151MB/0.96s -> 29MB, measured live).
  const ageFilterPg = (age: string | undefined, yearExpr = "year") => {
    const max = age ? AGE_CATEGORIES[age] : undefined;
    return max !== undefined ? `AND birth_year IS NOT NULL AND (${yearExpr} - birth_year) <= ${max}` : "";
  };
  const resultsSql = (extraWhere: string, order: string, limit: number) => `
    SELECT date::text AS date, year, event_name, athletics_event, place, mark_display,
      division_key_resolved AS competition_level, ROUND(competition_score::numeric, 0) AS competition_score,
      athlete_id, athlete_display_name AS display_name
    FROM country_results
    WHERE year = $1 AND nationality = $2 AND gender = $3
      AND competition_score IS NOT NULL ${ageFilterPg(f.age)} ${extraWhere}
    ORDER BY ${order}
    LIMIT ${limit}`;
  const params = [year, code, f.gender];

  // LIMIT 500 here -- the squad section only ever renders
  // squad.slice(0, 500) (ViewAllList caps there). Without this, a big
  // country like USA returned every athlete with so much as one scored
  // result that year (18,042 rows, ~3.7MB for a single season) -- past
  // Next's unstable_cache 2MB-per-item ceiling, so getCountryDetail
  // silently never cached at all (confirmed live: "items over 2MB can
  // not be cached", recomputing from scratch on every single request).
  const [athletes, lastWins, topResults, seasons, owMedals] = await Promise.all([
    pgQuery<CountryAthleteRow>(
      `
      WITH athletes AS (
        SELECT athlete_id, (ARRAY_AGG(athlete_display_name))[1] AS display_name, (ARRAY_AGG(birth_year))[1] AS birth_year,
          ROUND(SUM(competition_score)::numeric, 0) AS points,
          COUNT(*) FILTER (WHERE place = 1) AS wins,
          (ARRAY_AGG(athletics_event ORDER BY competition_score DESC))[1] AS main_event
        FROM country_results
        WHERE year = $1 AND nationality = $2 AND gender = $3 AND competition_score IS NOT NULL ${ageFilterPg(f.age)}
        GROUP BY athlete_id
      )
      SELECT *, ROW_NUMBER() OVER (ORDER BY points DESC) AS rn_in_country,
        ROW_NUMBER() OVER (ORDER BY points DESC) <= ${COUNTED_ATHLETES} AS counts
      FROM athletes
      ORDER BY points DESC
      LIMIT 500
    `,
      params
    ),
    pgQuery<CountryResultRow>(resultsSql("AND place = 1", "date DESC, competition_score DESC", 300), params),
    pgQuery<CountryResultRow>(resultsSql("", "competition_score DESC", 200), params),
    getCountrySeasons(code, f, seasonEvent),
    // all-time Olympic / World Championships medals of the country (finals,
    // one per discipline and edition; relays count once)
    pgQuery<{ olympic: number; worlds: number }>(
      `
      SELECT
        COUNT(DISTINCT CASE WHEN is_olympics THEN year::text || athletics_event || place::text END) AS olympic,
        COUNT(DISTINCT CASE WHEN NOT is_olympics THEN year::text || athletics_event || place::text END) AS worlds
      FROM country_results
      WHERE nationality = $1 AND gender = $2 AND division_key_resolved = 'OW'
        AND counts_for_medals AND place BETWEEN 1 AND 3 AND is_final
    `,
      [code, f.gender]
    ),
  ]);

  return { athletes, lastWins, topResults, seasons, owMedals: owMedals[0] ?? { olympic: 0, worlds: 0 } };
}
export const getCountryDetail = unstable_cache(_getCountryDetail, ["getCountryDetail"], DAY_CACHE);

// The country's points and rank for every season (same rule as the ranking).
// seasonEvent: one discipline only -- not precomputed (too many discipline
// combinations to materialize), still a live per-event aggregation.
async function getCountrySeasons(code: string, f: CountryFilters, seasonEvent?: string): Promise<CountrySeasonRow[]> {
  if (!seasonEvent) {
    // Common case: every year's rank, straight off the precomputed table --
    // RANK() still needs every country's points for that year, but reading
    // them from the tiny precomputed table instead of aggregating
    // events_enriched live is the same win as getCountryRanking above.
    return pgQuery<CountrySeasonRow>(
      `
      SELECT year, points, rank FROM (
        SELECT year, code, points, RANK() OVER (PARTITION BY year ORDER BY points DESC) AS rank
        FROM country_season_points
        WHERE gender = $1 AND age_cat = $2
      ) t
      WHERE code = $3
      ORDER BY year DESC
    `,
      [f.gender, f.age ?? "", code]
    );
  }
  return pgQuery<CountrySeasonRow>(
    `
    WITH athletes AS (
      SELECT year, athlete_id,
        (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
        SUM(competition_score) AS points
      FROM events
      WHERE gender = $1 AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
        ${ageFilter(f.age)} AND athletics_event = $2
      GROUP BY year, athlete_id
    ),
    per_country AS (
      SELECT year, nationality AS code, ROUND(SUM(points)::numeric, 0) AS points
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY year, nationality ORDER BY points DESC) AS rn
        FROM athletes WHERE nationality IS NOT NULL
      ) x
      WHERE rn <= ${COUNTED_ATHLETES}
      GROUP BY year, nationality
    )
    SELECT year, points, rank
    FROM (SELECT *, RANK() OVER (PARTITION BY year ORDER BY points DESC) AS rank FROM per_country) y
    WHERE code = $3
    ORDER BY year DESC
  `,
    [f.gender, seasonEvent, code]
  );
}

async function _getCountryName(code: string): Promise<string> {
  const rows = await pgQuery<{ name: string }>(`SELECT name FROM countries WHERE code = $1`, [code]);
  return rows[0]?.name ?? code;
}
export const getCountryName = unstable_cache(_getCountryName, ["getCountryName"], DAY_CACHE);

async function _getCountryYears(): Promise<number[]> {
  const rows = await pgQuery<{ year: number }>(`
    SELECT DISTINCT year FROM country_season_points WHERE year IS NOT NULL ORDER BY year DESC
  `);
  return rows.map((r) => r.year);
}
export const getCountryYears = unstable_cache(_getCountryYears, ["getCountryYears"], DAY_CACHE);

export function parseCountryFilters(sp: { gender?: string; age?: string; type?: string; event?: string }): CountryFilters {
  const type = isRaceType(sp.type) ? sp.type : undefined;
  const catalog = EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women] as string[]);
  const event = sp.event && catalog.includes(sp.event) && (!type || eventMatchesType(sp.event, type)) ? sp.event : undefined;
  return {
    gender: sp.gender === "Women" ? "Women" : "Men",
    age: sp.age && sp.age in AGE_CATEGORIES ? sp.age : undefined,
    type,
    event,
  };
}

// ---------------------------------------------------------------------
// Nations ranking in the four views of the Rankings page (same 24-best
// rule): season, rolling 12 months, wins, and one discipline. prev_rank =
// the same ranking as of two weeks before the latest result (movement).
// ---------------------------------------------------------------------

export type NationView = "season" | "rolling" | "wins" | "discipline";

export type NationRankingRow = {
  code: string;
  name: string;
  rank: number;
  prev_rank: number | null;
  points: number;
  wins: number;
  n_counted: number;
};

// Fast path against nation_ranking_cache (see schema.sql's comment and
// serving/refresh_ranking_cache.py) -- same fix as getIndividualRanking's
// fetchIndividualRankingCached: the `area` filter used to still pay the
// full per-athlete-then-per-country aggregation over all of `events`
// every time, applied only at the very end. Covers the common case (no
// age/event filter, current season or rolling); age/event fall back to
// the live query below since they narrow the aggregation itself, not
// just the final list.
async function fetchNationRankingCached(p: {
  view: NationView;
  gender: CountryGender;
  year: number;
  area?: string;
}): Promise<NationRankingRow[]> {
  const scope = p.view === "rolling" ? "rolling" : "season";
  const byWins = p.view === "wins";
  const rankCol = byWins ? "rank_wins" : "rank_points";
  const prevRankCol = byWins ? "prev_rank_wins" : "prev_rank_points";

  const params: unknown[] = [scope, p.gender];
  let idx = 2;
  const yearFilter = scope === "season" ? `AND year = $${++idx}` : "AND year IS NULL";
  if (scope === "season") params.push(p.year);
  let areaFilter = "";
  if (p.area) { areaFilter = `AND code IN (SELECT code FROM countries WHERE area = $${++idx})`; params.push(p.area); }

  return pgQuery<NationRankingRow>(
    `
    SELECT code, name, points, wins, n_counted,
      ${rankCol} AS rank, ${prevRankCol} AS prev_rank
    FROM nation_ranking_cache
    WHERE scope = $1 AND gender = $2 ${yearFilter} ${areaFilter}
    ORDER BY ${rankCol}
  `,
    params
  );
}

async function _getNationRanking(p: {
  view: NationView;
  gender: CountryGender;
  year: number;
  age?: string;
  event?: string;
  area?: string; // World Athletics area; ranks stay world ranks
}): Promise<NationRankingRow[]> {
  const currentYear = new Date().getFullYear();
  const cacheEligible =
    p.view !== "discipline" && !p.age && !p.event && (p.view === "rolling" || p.year === currentYear);
  if (cacheEligible) return fetchNationRankingCached(p);
  return _getNationRankingLive(p);
}

async function _getNationRankingLive(p: {
  view: NationView;
  gender: CountryGender;
  year: number;
  age?: string;
  event?: string;
  area?: string; // World Athletics area; ranks stay world ranks
}): Promise<NationRankingRow[]> {
  // Positional params built up as needed -- Postgres infers a prepared
  // statement's parameter count from the highest $N actually referenced,
  // so a $N for `year` must be left out entirely on the rolling view
  // (same gotcha hit migrating rankings.ts's rolling view).
  const params: unknown[] = [p.gender];
  let idx = 2;
  let yearPh = "";
  if (p.view !== "rolling") {
    params.push(p.year);
    yearPh = `$${idx++}`;
  }
  let eventPh = "";
  if (p.event) {
    params.push(p.event);
    eventPh = `$${idx++}`;
  }
  let areaPh = "";
  if (p.area) {
    params.push(p.area);
    areaPh = `$${idx++}`;
  }

  const nowWin = p.view === "rolling" ? "date > l.d - INTERVAL '365 days' AND date <= l.d" : `year = ${yearPh}`;
  const prevWin =
    p.view === "rolling"
      ? "date > (l.d - INTERVAL '14 days' - INTERVAL '365 days') AND date <= (l.d - INTERVAL '14 days')"
      : `year = ${yearPh} AND date <= (l.d - INTERVAL '14 days')`;
  const order = p.view === "wins" ? "wins DESC, points DESC" : "points DESC";
  const agg = (win: string) => `
    SELECT nationality AS code,
      ROUND(SUM(CASE WHEN rn <= ${COUNTED_ATHLETES} THEN points ELSE 0 END)::numeric, 0) AS points,
      COUNT(*) FILTER (WHERE rn <= ${COUNTED_ATHLETES}) AS n_counted,
      SUM(wins) AS wins
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY points DESC) AS rn
      FROM (
        SELECT athlete_id,
          (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
          SUM(competition_score) AS points, COUNT(*) FILTER (WHERE place = 1) AS wins
        FROM events, latest l
        WHERE gender = $1 AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
          AND ${win} ${ageFilter(p.age)} ${eventPh ? `AND athletics_event = ${eventPh}` : ""}
        GROUP BY athlete_id
      ) x
      WHERE nationality IS NOT NULL
    ) y
    GROUP BY nationality`;
  return pgQuery<NationRankingRow>(
    `
    WITH latest AS (SELECT MAX(date) AS d FROM events WHERE date <= CURRENT_DATE),
    ${NAMES_CTE},
    now_c AS (${agg(nowWin)}),
    prev_c AS (${agg(prevWin)}),
    ranked AS (SELECT *, RANK() OVER (ORDER BY ${order}) AS rank FROM now_c WHERE points > 0 OR wins > 0),
    prev_ranked AS (SELECT code, RANK() OVER (ORDER BY ${order}) AS prev_rank FROM prev_c WHERE points > 0 OR wins > 0)
    SELECT r.code, COALESCE(n.name, r.code) AS name, r.rank, pr.prev_rank, r.points, r.wins, r.n_counted
    FROM ranked r
    LEFT JOIN prev_ranked pr USING (code)
    LEFT JOIN names n USING (code)
    ${areaPh ? `WHERE r.code IN (SELECT code FROM countries WHERE area = ${areaPh})` : ""}
    ORDER BY r.rank
  `,
    params
  );
}
export const getNationRanking = unstable_cache(_getNationRanking, ["getNationRanking"], DAY_CACHE);
