import { runQuery } from "./bigquery";
import { pgQuery } from "./pg";
import { AGE_CATEGORIES } from "./queries";

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
  { key: "gold", label: "Gold", from: 1, to: 8, color: "text-yellow-400", bg: "bg-yellow-400", border: "border-yellow-400/40" },
  { key: "silver", label: "Silver", from: 9, to: 16, color: "text-neutral-300", bg: "bg-neutral-300", border: "border-neutral-300/40" },
  { key: "bronze", label: "Bronze", from: 17, to: 24, color: "text-orange-500", bg: "bg-orange-500", border: "border-orange-500/40" },
] as const;

export function tierForRank(rank: number) {
  return TIERS.find((t) => rank >= t.from && rank <= t.to) ?? null;
}

export type CountryFilters = { gender: CountryGender; age?: string };

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
export async function getCountryRanking(year: number, f: CountryFilters): Promise<CountryRankingRow[]> {
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

export async function getCountryDetail(code: string, year: number, f: CountryFilters, seasonEvent?: string) {
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
  return runQuery<CountrySeasonRow>(
    `
    WITH athletes AS (
      SELECT year, athlete_id,
        ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
        SUM(competition_score) AS points
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE gender = @gender AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
        ${ageFilter(f.age)} AND athletics_event = @seasonEvent
      GROUP BY year, athlete_id
    ),
    per_country AS (
      SELECT year, nationality AS code, ROUND(SUM(points), 0) AS points
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY year, nationality ORDER BY points DESC) AS rn
        FROM athletes WHERE nationality IS NOT NULL
      )
      WHERE rn <= ${COUNTED_ATHLETES}
      GROUP BY year, nationality
    )
    SELECT year, points, rank
    FROM (SELECT *, RANK() OVER (PARTITION BY year ORDER BY points DESC) AS rank FROM per_country)
    WHERE code = @code
    ORDER BY year DESC
  `,
    { code, gender: f.gender, seasonEvent }
  );
}

export async function getCountryName(code: string): Promise<string> {
  const rows = await pgQuery<{ name: string }>(`SELECT name FROM countries WHERE code = $1`, [code]);
  return rows[0]?.name ?? code;
}

export async function getCountryYears(): Promise<number[]> {
  const rows = await pgQuery<{ year: number }>(`
    SELECT DISTINCT year FROM country_season_points WHERE year IS NOT NULL ORDER BY year DESC
  `);
  return rows.map((r) => r.year);
}

export function parseCountryFilters(sp: { gender?: string; age?: string }): CountryFilters {
  return {
    gender: sp.gender === "Women" ? "Women" : "Men",
    age: sp.age && sp.age in AGE_CATEGORIES ? sp.age : undefined,
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

export async function getNationRanking(p: {
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
