import { runQuery } from "./bigquery";

export type LatestResult = {
  date: string;
  event_name: string;
  athletics_event: string;
  gender: string;
  display_name: string;
  mark_display: string;
  competition_level: string | null;
};

export async function getLatestResults(limit = 12): Promise<LatestResult[]> {
  return runQuery<LatestResult>(`
    SELECT
      CAST(date AS STRING) AS date,
      event_name, athletics_event, gender,
      athlete_display_name AS display_name,
      mark_display,
      division_key_resolved AS competition_level
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE place = 1
      AND (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%')
      AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
      AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
      AND athlete_display_name IS NOT NULL
    ORDER BY date DESC, competition_score DESC
    LIMIT ${limit}
  `);
}

export type UpcomingCompetition = {
  date_start: string;
  date_end: string;
  name: string;
  venue: string;
  country: string;
  category: string;
  disciplines: string;
};

export async function getUpcomingCompetitions(limit = 10): Promise<UpcomingCompetition[]> {
  return runQuery<UpcomingCompetition>(`
    SELECT
      CAST(date_start AS STRING) AS date_start,
      CAST(date_end AS STRING) AS date_end,
      name, venue, country, category, disciplines
    FROM \`athletics-database.tablasauxiliares.upcoming_competitions\`
    WHERE date_start >= CURRENT_DATE()
      AND category IN ('OW','DF','GW','GL','A','B')
    ORDER BY date_start ASC
    LIMIT ${limit}
  `);
}

export type YearRankingRow = {
  athlete_id: string;
  display_name: string;
  gender: string;
  puntos_anio: number;
  n_resultados: number;
};

export async function getYearRanking(year: number, limit = 10): Promise<YearRankingRow[]> {
  return runQuery<YearRankingRow>(`
    SELECT
      athlete_id, ANY_VALUE(athlete_display_name) AS display_name, gender,
      ROUND(SUM(competition_score), 0) AS puntos_anio,
      COUNT(*) AS n_resultados
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE year = ${year} AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
    GROUP BY athlete_id, gender
    QUALIFY ROW_NUMBER() OVER (PARTITION BY gender ORDER BY puntos_anio DESC) <= ${limit}
    ORDER BY gender, puntos_anio DESC
  `);
}

export type YearBestMarkRow = {
  athletics_event: string;
  gender: string;
  display_name: string;
  mark_display: string;
  event_name: string;
  date: string;
};

const HEADLINE_EVENTS = [
  "100 Metres", "200 Metres", "400 Metres", "800 Metres", "1500 Metres",
  "5000 Metres", "10000 Metres", "Marathon",
];

export async function getYearBestMarks(year: number, limitPerEvent = 3): Promise<YearBestMarkRow[]> {
  return runQuery<YearBestMarkRow>(`
    WITH ranked AS (
      SELECT
        athletics_event, gender, athlete_display_name AS display_name,
        mark_display, event_name, CAST(date AS STRING) AS date,
        ROW_NUMBER() OVER (
          PARTITION BY athletics_event, gender
          ORDER BY mark_seconds ASC
        ) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE year = ${year} AND mark_seconds IS NOT NULL
        AND athletics_event IN (${HEADLINE_EVENTS.map((e) => `'${e}'`).join(",")})
        AND (wind_legal IS NULL OR wind_legal = TRUE)
        AND athlete_display_name IS NOT NULL
    )
    SELECT athletics_event, gender, display_name, mark_display, event_name, date
    FROM ranked WHERE rk <= ${limitPerEvent}
    ORDER BY athletics_event, gender, rk
  `);
}
