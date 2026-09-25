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
    SELECT Codigo AS code, ANY_VALUE(Pais) AS name
    FROM \`athletics-database.tablasauxiliares.paises_traduccion_codigos_v2\`
    GROUP BY Codigo
  )`;

export type CountryRankingRow = {
  code: string;
  name: string;
  rank: number;
  points: number;
  n_counted: number;
  n_athletes: number;
  wins: number;
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
        SUM(wins) AS wins
      FROM counted
      GROUP BY nationality
    )
    SELECT c.code, IFNULL(n.name, c.code) AS name,
      RANK() OVER (ORDER BY c.points DESC) AS rank,
      c.points, c.n_counted, c.n_athletes, c.wins
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

export async function getCountryDetail(code: string, year: number, f: CountryFilters) {
  const params = { code, year, gender: f.gender };
  const resultsSql = (extraWhere: string, order: string) => `
    SELECT CAST(date AS STRING) AS date, year, event_name, athletics_event, place, mark_display,
      division_key_resolved AS competition_level, ROUND(competition_score, 0) AS competition_score,
      athlete_id, athlete_display_name AS display_name
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE year = @year AND nationality = @code AND gender = @gender AND athlete_id IS NOT NULL
      AND competition_score IS NOT NULL ${ageFilter(f.age)} ${extraWhere}
    ORDER BY ${order}
    LIMIT 15`;

  const [athletes, lastWins, topResults, seasons] = await Promise.all([
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
    runQuery<CountryResultRow>(resultsSql("AND place = 1", "date DESC, competition_score DESC"), params),
    runQuery<CountryResultRow>(resultsSql("", "competition_score DESC"), params),
    getCountrySeasons(code, f),
  ]);

  return { athletes, lastWins, topResults, seasons };
}

// The country's points and rank for every season (same rule as the ranking).
async function getCountrySeasons(code: string, f: CountryFilters): Promise<CountrySeasonRow[]> {
  return runQuery<CountrySeasonRow>(
    `
    WITH athletes AS (
      SELECT year, athlete_id,
        ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
        SUM(competition_score) AS points
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE gender = @gender AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
        ${ageFilter(f.age)}
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
    { code, gender: f.gender }
  );
}

export async function getCountryName(code: string): Promise<string> {
  const rows = await runQuery<{ name: string }>(
    `SELECT ANY_VALUE(Pais) AS name FROM \`athletics-database.tablasauxiliares.paises_traduccion_codigos_v2\` WHERE Codigo = @code`,
    { code }
  );
  return rows[0]?.name ?? code;
}

export async function getCountryYears(): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE competition_score IS NOT NULL AND year >= 1990
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
