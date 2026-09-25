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
  // upcoming only
  disciplines: string | null;
};

// tiers at or above `minTier` (OW best ... F lowest)
function tiersUpTo(minTier: string) {
  const i = TIER_ORDER.indexOf(minTier as (typeof TIER_ORDER)[number]);
  return TIER_ORDER.slice(0, i < 0 ? 5 : i + 1);
}

export async function getCalendar(year: number, minTier: string, month?: number): Promise<CalendarRow[]> {
  const tiers = tiersUpTo(minTier);
  const monthFilter = (col: string) => (month ? `AND EXTRACT(MONTH FROM ${col}) = ${month}` : "");
  return runQuery<CalendarRow>(
    `
    WITH editions AS (
      SELECT event_name, year,
        MIN(date) AS date_start, MAX(date) AS date_end,
        APPROX_TOP_COUNT(city, 1)[OFFSET(0)].value AS city,
        APPROX_TOP_COUNT(country, 1)[OFFSET(0)].value AS country,
        ARRAY_AGG(division_key_resolved IGNORE NULLS
          ORDER BY \`athletics-database.registry.tier_rank\`(division_key_resolved) LIMIT 1)[SAFE_OFFSET(0)] AS tier,
        COUNT(DISTINCT CONCAT(athletics_event, gender)) AS n_events,
        ARRAY_AGG(IF(competition_score IS NOT NULL AND athlete_id IS NOT NULL,
          STRUCT(athlete_id, athlete_display_name, nationality, athletics_event, mark_display), NULL) IGNORE NULLS
          ORDER BY competition_score DESC LIMIT 1)[SAFE_OFFSET(0)] AS top
      FROM \`athletics-database.athletics_all.events_enriched\`
      -- older sources (sports123) have no dates: keep those editions, undated
      WHERE year = @year ${monthFilter("date")}
      GROUP BY event_name, year
    ),
    past AS (
      SELECT 'past' AS kind, CAST(date_start AS STRING) AS date_start, CAST(date_end AS STRING) AS date_end,
        event_name AS name, city, country, tier, n_events,
        top.athlete_id AS top_athlete_id, top.athlete_display_name AS top_athlete,
        top.nationality AS top_nationality, top.athletics_event AS top_event, top.mark_display AS top_mark,
        CAST(NULL AS STRING) AS disciplines
      FROM editions
      WHERE tier IN UNNEST(@tiers)
    ),
    upcoming AS (
      SELECT 'upcoming' AS kind, CAST(date_start AS STRING), CAST(date_end AS STRING),
        name, REGEXP_EXTRACT(venue, r',\\s*([^,(]+?)\\s*\\(') AS city, country, category AS tier,
        CAST(NULL AS INT64) AS n_events,
        CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
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
}

export async function getCalendarYears(): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year FROM \`athletics-database.athletics_all.events_enriched\` WHERE year IS NOT NULL
    UNION DISTINCT
    SELECT DISTINCT EXTRACT(YEAR FROM date_start) FROM \`athletics-database.tablasauxiliares.upcoming_competitions\`
    ORDER BY year DESC
  `);
  return rows.map((r) => r.year);
}
