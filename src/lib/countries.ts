import { runQuery } from "./bigquery";
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

// Per-athlete season totals + their position inside their country.
function athletesCte(f: CountryFilters) {
  return `
    athletes AS (
      SELECT
        athlete_id,
        ANY_VALUE(athlete_display_name) AS display_name,
        ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
        ARRAY_AGG(birth_year IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS birth_year,
        ROUND(SUM(competition_score), 0) AS points,
        COUNTIF(place = 1) AS wins,
        COUNTIF(place BETWEEN 1 AND 3) AS podiums,
        -- main discipline: where the athlete scored most that season
        ARRAY_AGG(STRUCT(athletics_event, competition_score) ORDER BY competition_score DESC LIMIT 1)[OFFSET(0)].athletics_event AS main_event
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE year = @year AND gender = @gender
        AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
        ${ageFilter(f.age)}
      GROUP BY athlete_id
    ),
    counted AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY points DESC) AS rn_in_country,
        ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY points DESC) <= ${COUNTED_ATHLETES} AS counts
      FROM athletes
      WHERE nationality IS NOT NULL
    )`;
}

const NAMES_CTE = `
  names AS (
    SELECT code, name FROM \`athletics-database.tablasauxiliares.countries\`
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

export async function getCountryRanking(year: number, f: CountryFilters): Promise<CountryRankingRow[]> {
  return runQuery<CountryRankingRow>(
    `
    WITH ${athletesCte(f)},
    ${NAMES_CTE},
    per_country AS (
      SELECT nationality AS code,
        ROUND(SUM(IF(counts, points, 0)), 0) AS points,
        COUNTIF(counts) AS n_counted,
        COUNT(*) AS n_athletes,
        SUM(wins) AS wins,
        SUM(podiums) AS podiums
      FROM counted
      GROUP BY nationality
    )
    SELECT c.code, IFNULL(n.name, c.code) AS name,
      RANK() OVER (ORDER BY c.points DESC) AS rank,
      c.points, c.n_counted, c.n_athletes, c.wins, c.podiums
    FROM per_country c
    LEFT JOIN names n USING (code)
    WHERE c.points > 0
    ORDER BY rank
  `,
    { year, gender: f.gender }
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
  const params = { code, year, gender: f.gender };
  const resultsSql = (extraWhere: string, order: string, limit: number) => `
    SELECT CAST(date AS STRING) AS date, year, event_name, athletics_event, place, mark_display,
      division_key_resolved AS competition_level, ROUND(competition_score, 0) AS competition_score,
      athlete_id, athlete_display_name AS display_name
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE year = @year AND nationality = @code AND gender = @gender AND athlete_id IS NOT NULL
      AND competition_score IS NOT NULL ${ageFilter(f.age)} ${extraWhere}
    ORDER BY ${order}
    LIMIT ${limit}`;

  const [athletes, lastWins, topResults, seasons, owMedals] = await Promise.all([
    runQuery<CountryAthleteRow>(
      `
      WITH ${athletesCte(f)}
      SELECT athlete_id, display_name, birth_year, points, wins, main_event, rn_in_country, counts
      FROM counted
      WHERE nationality = @code
      ORDER BY points DESC
    `,
      params
    ),
    runQuery<CountryResultRow>(resultsSql("AND place = 1", "date DESC, competition_score DESC", 300), params),
    runQuery<CountryResultRow>(resultsSql("", "competition_score DESC", 200), params),
    getCountrySeasons(code, f, seasonEvent),
    // all-time Olympic / World Championships medals of the country (finals,
    // one per discipline and edition; relays count once)
    runQuery<{ olympic: number; worlds: number }>(
      `
      SELECT
        COUNT(DISTINCT IF(REGEXP_CONTAINS(event_name, r'(?i)olympic games'), CONCAT(year, athletics_event, place), NULL)) AS olympic,
        COUNT(DISTINCT IF(NOT REGEXP_CONTAINS(event_name, r'(?i)olympic games'), CONCAT(year, athletics_event, place), NULL)) AS worlds
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE nationality = @code AND gender = @gender AND division_key_resolved = 'OW'
        AND NOT REGEXP_CONTAINS(event_name, r'(?i)ultimate') AND place BETWEEN 1 AND 3
        AND (round IS NULL OR round = '' OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semi%' AND LOWER(round) NOT LIKE '%quarter%'))
    `,
      { code, gender: f.gender }
    ),
  ]);

  return { athletes, lastWins, topResults, seasons, owMedals: owMedals[0] ?? { olympic: 0, worlds: 0 } };
}

// The country's points and rank for every season (same rule as the ranking).
// seasonEvent: one discipline only (same 24-best rule, within that event)
async function getCountrySeasons(code: string, f: CountryFilters, seasonEvent?: string): Promise<CountrySeasonRow[]> {
  return runQuery<CountrySeasonRow>(
    `
    WITH athletes AS (
      SELECT year, athlete_id,
        ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
        SUM(competition_score) AS points
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE gender = @gender AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
        ${ageFilter(f.age)} ${seasonEvent ? "AND athletics_event = @seasonEvent" : ""}
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
    { code, gender: f.gender, ...(seasonEvent ? { seasonEvent } : {}) }
  );
}

export async function getCountryName(code: string): Promise<string> {
  const rows = await runQuery<{ name: string }>(
    `SELECT name FROM \`athletics-database.tablasauxiliares.countries\` WHERE code = @code`,
    { code }
  );
  return rows[0]?.name ?? code;
}

export async function getCountryYears(): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE competition_score IS NOT NULL AND year IS NOT NULL
    ORDER BY year DESC
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
  const nowWin = p.view === "rolling" ? "date > DATE_SUB(l.d, INTERVAL 365 DAY) AND date <= l.d" : "year = @year";
  const prevWin =
    p.view === "rolling"
      ? "date > DATE_SUB(DATE_SUB(l.d, INTERVAL 14 DAY), INTERVAL 365 DAY) AND date <= DATE_SUB(l.d, INTERVAL 14 DAY)"
      : "year = @year AND date <= DATE_SUB(l.d, INTERVAL 14 DAY)";
  const order = p.view === "wins" ? "wins DESC, points DESC" : "points DESC";
  const agg = (win: string) => `
    SELECT nationality AS code,
      ROUND(SUM(IF(rn <= ${COUNTED_ATHLETES}, points, 0)), 0) AS points,
      COUNTIF(rn <= ${COUNTED_ATHLETES}) AS n_counted,
      SUM(wins) AS wins
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY points DESC) AS rn
      FROM (
        SELECT athlete_id,
          ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
          SUM(competition_score) AS points, COUNTIF(place = 1) AS wins
        FROM \`athletics-database.athletics_all.events_enriched\`, latest l
        WHERE gender = @gender AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
          AND ${win} ${ageFilter(p.age)} ${p.event ? "AND athletics_event = @event" : ""}
        GROUP BY athlete_id
      )
      WHERE nationality IS NOT NULL
    )
    GROUP BY nationality`;
  return runQuery<NationRankingRow>(
    `
    WITH latest AS (SELECT MAX(date) AS d FROM \`athletics-database.athletics_all.events_enriched\` WHERE date <= CURRENT_DATE()),
    ${NAMES_CTE},
    now_c AS (${agg(nowWin)}),
    prev_c AS (${agg(prevWin)}),
    ranked AS (SELECT *, RANK() OVER (ORDER BY ${order}) AS rank FROM now_c WHERE points > 0 OR wins > 0),
    prev_ranked AS (SELECT code, RANK() OVER (ORDER BY ${order}) AS prev_rank FROM prev_c WHERE points > 0 OR wins > 0)
    SELECT r.code, IFNULL(n.name, r.code) AS name, r.rank, pr.prev_rank, r.points, r.wins, r.n_counted
    FROM ranked r
    LEFT JOIN prev_ranked pr USING (code)
    LEFT JOIN names n USING (code)
    ${p.area ? "WHERE r.code IN (SELECT code FROM \`athletics-database.tablasauxiliares.countries\` WHERE area = @area)" : ""}
    ORDER BY r.rank
  `,
    { gender: p.gender, year: p.year, ...(p.event ? { event: p.event } : {}), ...(p.area ? { area: p.area } : {}) }
  );
}
