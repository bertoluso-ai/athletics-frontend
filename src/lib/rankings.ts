import { runQuery } from "./bigquery";
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
};

export type RankingParams = {
  view: RankingView;
  gender: "Men" | "Women";
  year: number;
  nationality?: string; // one code...
  nationalityCodes?: string[]; // ...or every code of that country (sources disagree: NED/NET/NLD)
  age?: string;
  page: number;
  pageSize: number;
};

const T = "`athletics-database.athletics_all.events_enriched`";

function windows(view: RankingView) {
  // @d = latest result date; @d14 = two weeks before
  if (view === "rolling") {
    return {
      now: "date > DATE_SUB(@d, INTERVAL 365 DAY) AND date <= @d",
      prev: "date > DATE_SUB(@d14, INTERVAL 365 DAY) AND date <= @d14",
    };
  }
  return { now: "year = @year", prev: "year = @year AND date <= @d14" };
}

export async function getIndividualRanking(p: RankingParams) {
  const w = windows(p.view);
  const ageMax = p.age ? AGE_CATEGORIES[p.age] : undefined;
  const ageSql = ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : "";
  const order = p.view === "wins" ? "wins DESC, points DESC" : "points DESC";
  const offset = (p.page - 1) * p.pageSize;

  const sql = `
    WITH latest AS (SELECT MAX(date) AS d FROM ${T} WHERE date <= CURRENT_DATE()),
    base AS (
      SELECT athlete_id, athlete_display_name, nationality, birth_year, date, year,
        competition_score, place, athletics_event
      FROM ${T}
      WHERE gender = @gender AND competition_score IS NOT NULL AND athlete_id IS NOT NULL ${ageSql}
    ),
    now_agg AS (
      SELECT athlete_id,
        ANY_VALUE(athlete_display_name) AS display_name,
        ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
        ARRAY_AGG(birth_year IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS birth_year,
        ROUND(SUM(competition_score), 0) AS points,
        COUNTIF(place = 1) AS wins,
        ARRAY_AGG(STRUCT(athletics_event, competition_score) ORDER BY competition_score DESC LIMIT 1)[OFFSET(0)].athletics_event AS main_event
      FROM base, latest
      WHERE ${w.now.replaceAll("@d14", "DATE_SUB(latest.d, INTERVAL 14 DAY)").replaceAll("@d", "latest.d")}
      GROUP BY athlete_id
    ),
    prev_agg AS (
      SELECT athlete_id, SUM(competition_score) AS points, COUNTIF(place = 1) AS wins
      FROM base, latest
      WHERE ${w.prev.replaceAll("@d14", "DATE_SUB(latest.d, INTERVAL 14 DAY)").replaceAll("@d", "latest.d")}
      GROUP BY athlete_id
    ),
    ranked AS (
      SELECT n.*, RANK() OVER (ORDER BY ${order.replaceAll("wins", "n.wins").replaceAll("points", "n.points")}) AS rank
      FROM now_agg n
    ),
    prev_ranked AS (
      SELECT athlete_id, RANK() OVER (ORDER BY ${order}) AS prev_rank FROM prev_agg WHERE points > 0
    ),
    joined AS (
      SELECT r.*, pr.prev_rank
      FROM ranked r LEFT JOIN prev_ranked pr USING (athlete_id)
      ${p.nationalityCodes?.length ? "WHERE r.nationality IN UNNEST(@codes)" : p.nationality ? "WHERE r.nationality = @nationality" : ""}
    )
    SELECT *, COUNT(*) OVER () AS total FROM joined
    ORDER BY rank
    LIMIT ${p.pageSize} OFFSET ${offset}
  `;
  const rows = await runQuery<IndividualRankingRow & { total: number }>(sql, {
    gender: p.gender,
    year: p.year,
    ...(p.nationalityCodes?.length ? { codes: p.nationalityCodes } : p.nationality ? { nationality: p.nationality } : {}),
  });
  return { rows, total: rows[0]?.total ?? 0 };
}

// Movement only makes sense where the ranking is still moving.
export function hasMovement(view: RankingView, year: number, currentYear: number) {
  return view === "rolling" || year === currentYear;
}

// One entry per country NAME: the sources use several codes for the same
// country (NED/NET/NLD, SUI/SWI/CHE, RSA/SAF/ZAF...). `code` is the most
// used one (the option value), `codes` all of them (for filtering).
export async function getRankingNationalities(gender: string): Promise<{ code: string; name: string; codes: string[] }[]> {
  return runQuery(`
    WITH codes AS (
      SELECT nationality AS code, COUNT(*) AS n FROM ${T}
      WHERE gender = @gender AND nationality IS NOT NULL AND TRIM(nationality) != '' AND competition_score IS NOT NULL
      GROUP BY 1
    ),
    names AS (
      SELECT Codigo AS code, ANY_VALUE(Pais) AS name
      FROM \`athletics-database.tablasauxiliares.paises_traduccion_codigos_v2\` GROUP BY Codigo
    )
    SELECT IFNULL(n.name, c.code) AS name,
      ARRAY_AGG(c.code ORDER BY c.n DESC LIMIT 1)[OFFSET(0)] AS code,
      ARRAY_AGG(c.code ORDER BY c.n DESC) AS codes
    FROM codes c LEFT JOIN names n USING (code)
    WHERE IFNULL(n.name, '') NOT IN ('Unknown', 'Asia', 'Oceania', 'Africa', 'Europe', 'Americas')
    GROUP BY 1
    ORDER BY name
  `, { gender });
}

export async function getRankingYears(): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year FROM ${T} WHERE competition_score IS NOT NULL AND year >= 1990 ORDER BY year DESC
  `);
  return rows.map((r) => r.year);
}
