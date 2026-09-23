import { runQuery } from "./bigquery";
import { tierPriority, isFieldEvent } from "./events";

// ---------------------------------------------------------------------
// Athlete profile
// ---------------------------------------------------------------------

export type AthleteInfo = {
  athlete_id: string;
  display_name: string;
  gender: string | null;
  nationality: string | null;
  birth_year: number | null;
  first_year: number;
  last_year: number;
};

export async function getAthleteInfo(athleteId: string): Promise<AthleteInfo | null> {
  const rows = await runQuery<AthleteInfo>(`
    SELECT
      athlete_id,
      ANY_VALUE(athlete_display_name) AS display_name,
      ANY_VALUE(gender) AS gender,
      ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
      ARRAY_AGG(birth_year IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS birth_year,
      MIN(year) AS first_year,
      MAX(year) AS last_year
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id = @athleteId
    GROUP BY athlete_id
  `, { athleteId });
  return rows[0] ?? null;
}

export type BestResultRow = {
  athletics_event: string;
  gender: string;
  event_name: string;
  year: number;
  place: number;
  mark_display: string;
  competition_score: number;
};

export async function getAthleteBestResults(athleteId: string, limit = 10): Promise<BestResultRow[]> {
  return runQuery<BestResultRow>(`
    SELECT athletics_event, gender, event_name, year, place, mark_display,
      ROUND(competition_score, 0) AS competition_score
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id = @athleteId AND competition_score IS NOT NULL
    ORDER BY competition_score DESC
    LIMIT ${limit}
  `, { athleteId });
}

export type AthleteEventOption = { athletics_event: string; n_results: number; years: number[] };

// Disciplines this athlete has actually competed in, most-competed first,
// each with the list of years that actually have data for it -- lets the
// UI only ever offer discipline+year combos that have results.
export async function getAthleteEvents(athleteId: string): Promise<AthleteEventOption[]> {
  return runQuery<AthleteEventOption>(`
    SELECT athletics_event, COUNT(*) AS n_results,
      ARRAY_AGG(DISTINCT year ORDER BY year DESC) AS years
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id = @athleteId AND athletics_event IS NOT NULL AND year IS NOT NULL
    GROUP BY athletics_event
    ORDER BY n_results DESC, athletics_event ASC
  `, { athleteId });
}

export type PersonalBestRow = {
  athletics_event: string;
  gender: string;
  mark_display: string;
  event_name: string;
  year: number;
};

export async function getAthletePersonalBests(athleteId: string): Promise<PersonalBestRow[]> {
  return runQuery<PersonalBestRow>(`
    WITH track AS (
      SELECT athletics_event, gender, mark_display, event_name, year, mark_seconds AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event ORDER BY mark_seconds ASC) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND mark_seconds IS NOT NULL
    ),
    field AS (
      SELECT athletics_event, gender, mark_display, event_name, year, SAFE_CAST(mark AS FLOAT64) AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event ORDER BY SAFE_CAST(mark AS FLOAT64) DESC) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND mark_seconds IS NULL AND SAFE_CAST(mark AS FLOAT64) IS NOT NULL
    )
    SELECT athletics_event, gender, mark_display, event_name, year FROM track WHERE rk = 1
    UNION ALL
    SELECT athletics_event, gender, mark_display, event_name, year FROM field WHERE rk = 1
    ORDER BY athletics_event
  `, { athleteId });
}

export type YearPointsRow = { year: number; points: number; n_results: number };

export async function getAthleteYearlyPoints(athleteId: string): Promise<YearPointsRow[]> {
  return runQuery<YearPointsRow>(`
    SELECT year, ROUND(SUM(competition_score), 0) AS points, COUNT(*) AS n_results
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id = @athleteId AND competition_score IS NOT NULL
    GROUP BY year
    ORDER BY year DESC
  `, { athleteId });
}

export type AthleteYearResultRow = {
  date: string;
  event_name: string;
  athletics_event: string;
  round: string | null;
  place: number | null;
  mark_display: string;
  competition_level: string | null;
  competition_score: number | null;
  record: string | null;
  mark_value: number | null;
};

// All results for one athlete, one discipline, one year (or every year,
// when year is "all") -- best to worst, no limit (merges the old "Best
// Results" + "Results by Year" sections into a single filterable block).
export async function getAthleteResultsForYear(
  athleteId: string,
  year: number | "all",
  event: string
): Promise<AthleteYearResultRow[]> {
  const isField = isFieldEvent(event);
  return runQuery<AthleteYearResultRow>(`
    SELECT CAST(date AS STRING) AS date, event_name, athletics_event, round, place, mark_display,
      division_key_resolved AS competition_level, ROUND(competition_score, 0) AS competition_score,
      NULLIF(record, '') AS record,
      ${isField ? "SAFE_CAST(mark AS FLOAT64)" : "mark_seconds"} AS mark_value
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id = @athleteId AND athletics_event = @event
      ${year !== "all" ? "AND year = @year" : ""}
    ORDER BY competition_score DESC NULLS LAST, date DESC
  `, { athleteId, event, ...(year !== "all" ? { year } : {}) });
}

// ---------------------------------------------------------------------
// Latest results, grouped into races (competition + event + gender) with
// the top 3 finishers each, ordered by competition tier first.
// ---------------------------------------------------------------------

export type ResultRow = {
  event_name: string;
  athletics_event: string;
  gender: string;
  date: string;
  competition_level: string | null;
  place: number;
  athlete_id: string | null;
  display_name: string;
  mark_display: string;
  nationality: string | null;
  record: string | null;
};

export type PodiumEntry = {
  place: number;
  mark_display: string;
  nationality: string | null;
  record: string | null;
  athletes: { athlete_id: string | null; display_name: string }[];
};

export type Race = {
  key: string;
  event_name: string;
  athletics_event: string;
  gender: string;
  date: string;
  competition_level: string | null;
  top3: PodiumEntry[];
};

export async function getLatestRaces(
  maxRaces = 10,
  filters: { event?: string; tier?: string } = {}
): Promise<Race[]> {
  const { event, tier } = filters;
  const rows = await runQuery<ResultRow>(`
    SELECT
      event_name, athletics_event, gender,
      CAST(date AS STRING) AS date,
      division_key_resolved AS competition_level,
      place,
      athlete_id,
      athlete_display_name AS display_name,
      mark_display,
      nationality,
      NULLIF(record, '') AS record
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE place BETWEEN 1 AND 3
      AND (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%')
      AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
      AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
      AND athlete_display_name IS NOT NULL
      ${event ? "AND athletics_event = @event" : ""}
      ${tier ? "AND division_key_resolved = @tier" : ""}
    ORDER BY date DESC
  `, { ...(event ? { event } : {}), ...(tier ? { tier } : {}) });

  // Group into races, then within each race group by place -- a relay
  // team has one row per runner sharing the same place/mark/nationality,
  // and those must collapse into a single podium entry with a roster,
  // not one row per runner.
  const races = new Map<string, Race>();
  const podiumsByRace = new Map<string, Map<string, PodiumEntry>>();

  for (const r of rows) {
    const key = `${r.event_name}|${r.athletics_event}|${r.gender}|${r.date}`;
    let race = races.get(key);
    if (!race) {
      race = {
        key,
        event_name: r.event_name,
        athletics_event: r.athletics_event,
        gender: r.gender,
        date: r.date,
        competition_level: r.competition_level,
        top3: [],
      };
      races.set(key, race);
      podiumsByRace.set(key, new Map());
    }

    const podiums = podiumsByRace.get(key)!;
    const podiumKey = `${r.place}|${r.nationality ?? ""}`;
    let entry = podiums.get(podiumKey);
    if (!entry) {
      entry = { place: r.place, mark_display: r.mark_display, nationality: r.nationality, record: r.record, athletes: [] };
      podiums.set(podiumKey, entry);
      race.top3.push(entry);
    }
    entry.athletes.push({ athlete_id: r.athlete_id, display_name: r.display_name });
  }

  const list = Array.from(races.values());
  for (const race of list) race.top3.sort((a, b) => a.place - b.place);
  // Most recent first (this is "Latest Results") -- competition tier only
  // breaks ties between races on the same date.
  list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return tierPriority(a.competition_level) - tierPriority(b.competition_level);
  });
  return list.slice(0, maxRaces);
}

// ---------------------------------------------------------------------
// Upcoming competitions (calendar)
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Year ranking, for a single event + gender (points-based, our scoring).
// ---------------------------------------------------------------------

export type RankingRow = {
  athlete_id: string;
  display_name: string;
  points: number;
  n_results: number;
  nationality: string | null;
};

export async function getEventYearRanking(
  event: string,
  gender: string,
  year: number,
  limit = 10
): Promise<RankingRow[]> {
  return runQuery<RankingRow>(`
    SELECT
      athlete_id, ANY_VALUE(athlete_display_name) AS display_name,
      ROUND(SUM(competition_score), 0) AS points,
      COUNT(*) AS n_results,
      ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE year = ${year} AND athletics_event = @event AND gender = @gender
      AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
    GROUP BY athlete_id
    ORDER BY points DESC
    LIMIT ${limit}
  `, { event, gender });
}

// ---------------------------------------------------------------------
// Best marks of the year, for a single event + gender.
// ---------------------------------------------------------------------

export type MarkRow = {
  athlete_id: string;
  display_name: string;
  mark_display: string;
  event_name: string;
  date: string;
  nationality: string | null;
  record: string | null;
};

export async function getEventAllTimeBest(event: string, gender: string, limit = 10): Promise<MarkRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);

  return runQuery<MarkRow>(`
    SELECT athlete_id, athlete_display_name AS display_name, mark_display, event_name, CAST(date AS STRING) AS date, nationality,
      NULLIF(record, '') AS record
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athletics_event = @event AND gender = @gender
      AND athlete_display_name IS NOT NULL
      AND ${isField ? "SAFE_CAST(mark AS FLOAT64) IS NOT NULL" : "mark_seconds IS NOT NULL"}
      ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY athlete_id ORDER BY ${orderExpr}) = 1
    ORDER BY ${orderExpr}
    LIMIT ${limit}
  `, { event, gender });
}

export async function getEventAvailableYears(event: string, gender: string): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athletics_event = @event AND gender = @gender AND year IS NOT NULL
    ORDER BY year DESC
  `, { event, gender });
  return rows.map((r) => r.year);
}

export async function getEventYearBestMarks(
  event: string,
  gender: string,
  year: number,
  limit = 10
): Promise<MarkRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);

  return runQuery<MarkRow>(`
    SELECT athlete_id, athlete_display_name AS display_name, mark_display, event_name, CAST(date AS STRING) AS date, nationality,
      NULLIF(record, '') AS record
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE year = ${year} AND athletics_event = @event AND gender = @gender
      AND athlete_display_name IS NOT NULL
      AND ${isField ? "SAFE_CAST(mark AS FLOAT64) IS NOT NULL" : "mark_seconds IS NOT NULL"}
      ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY athlete_id ORDER BY ${orderExpr}) = 1
    ORDER BY ${orderExpr}
    LIMIT ${limit}
  `, { event, gender });
}
