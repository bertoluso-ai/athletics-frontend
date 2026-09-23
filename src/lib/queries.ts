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
  all_time_rank: number | null;
};

// Personal bests, each annotated with the athlete's all-time world rank in
// that discipline+gender (rank among every athlete's own personal best --
// same "one entry per athlete" rule as getEventAllTimeBest). Restricted via
// a join to only the handful of disciplines this athlete has a PB in, so it
// doesn't rank the entire table.
export async function getAthletePersonalBests(athleteId: string): Promise<PersonalBestRow[]> {
  return runQuery<PersonalBestRow>(`
    WITH my_pbs AS (
      SELECT athletics_event, gender, mark_display, event_name, year, mark_seconds AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event ORDER BY mark_seconds ASC) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND mark_seconds IS NOT NULL
      UNION ALL
      SELECT athletics_event, gender, mark_display, event_name, year, SAFE_CAST(mark AS FLOAT64) AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event ORDER BY SAFE_CAST(mark AS FLOAT64) DESC) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND mark_seconds IS NULL AND SAFE_CAST(mark AS FLOAT64) IS NOT NULL
    ),
    my_disciplines AS (
      SELECT DISTINCT athletics_event, gender FROM my_pbs WHERE rk = 1
    ),
    global_best AS (
      -- mark (raw text) is populated on virtually every row regardless of
      -- discipline, not just field events -- so "is mark present" can't be
      -- used to decide track vs field (that inverted 100m rankings: a
      -- slower time has a larger mark_seconds value, and treating it like
      -- a field distance made bigger look better). mark_seconds is the
      -- reliable track-only signal (same rule my_pbs above already uses),
      -- so a discipline only falls back to the field-style mark reading
      -- when NONE of its rows have mark_seconds at all.
      SELECT e.athletics_event, e.gender, e.athlete_id,
        MIN(IF(e.mark_seconds IS NOT NULL, e.mark_seconds, NULL)) AS best_track,
        MAX(IF(e.mark_seconds IS NULL, SAFE_CAST(e.mark AS FLOAT64), NULL)) AS best_field
      FROM \`athletics-database.athletics_all.events_enriched\` e
      JOIN my_disciplines d ON d.athletics_event = e.athletics_event AND d.gender = e.gender
      WHERE e.athlete_id IS NOT NULL
        AND (e.mark_seconds IS NOT NULL OR SAFE_CAST(e.mark AS FLOAT64) IS NOT NULL)
      GROUP BY e.athletics_event, e.gender, e.athlete_id
    ),
    ranked AS (
      SELECT athletics_event, gender, athlete_id,
        RANK() OVER (
          PARTITION BY athletics_event, gender
          ORDER BY IF(best_track IS NOT NULL, best_track, -best_field) ASC
        ) AS rnk
      FROM global_best
    )
    SELECT p.athletics_event, p.gender, p.mark_display, p.event_name, p.year, r.rnk AS all_time_rank
    FROM my_pbs p
    LEFT JOIN ranked r
      ON r.athletics_event = p.athletics_event AND r.gender = p.gender AND r.athlete_id = @athleteId
    WHERE p.rk = 1
    ORDER BY r.rnk ASC NULLS LAST
  `, { athleteId });
}

export type YearPointsRow = { year: number; points: number; n_results: number; rank: number | null };

// Total points per year (summed across every discipline), each annotated
// with the athlete's rank that year among all athletes of the same gender
// by total annual points -- an overall "how good was this athlete's year"
// ranking, not a per-discipline one.
export async function getAthleteYearlyPoints(athleteId: string, gender: string): Promise<YearPointsRow[]> {
  return runQuery<YearPointsRow>(`
    WITH my_totals AS (
      SELECT year, ROUND(SUM(competition_score), 0) AS points, COUNT(*) AS n_results
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND competition_score IS NOT NULL
      GROUP BY year
    ),
    my_years AS (SELECT DISTINCT year FROM my_totals),
    all_totals AS (
      SELECT e.athlete_id, e.year, SUM(e.competition_score) AS total
      FROM \`athletics-database.athletics_all.events_enriched\` e
      JOIN my_years y ON y.year = e.year
      WHERE e.competition_score IS NOT NULL AND e.athlete_id IS NOT NULL AND e.gender = @gender
      GROUP BY e.athlete_id, e.year
    ),
    ranked AS (
      SELECT athlete_id, year, RANK() OVER (PARTITION BY year ORDER BY total DESC) AS rnk
      FROM all_totals
    )
    SELECT t.year, t.points, t.n_results, r.rnk AS rank
    FROM my_totals t
    LEFT JOIN ranked r ON r.year = t.year AND r.athlete_id = @athleteId
    ORDER BY t.year DESC
  `, { athleteId, gender });
}

export type AthleteYearResultRow = {
  date: string | null;
  year: number;
  event_name: string;
  athletics_event: string;
  round: string | null;
  place: number | null;
  mark_display: string;
  competition_level: string | null;
  competition_score: number | null;
  record: string | null;
  mark_value: number | null;
  city: string | null;
  country: string | null;
  wind: string | null;
  wind_legal: boolean | null;
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
    SELECT CAST(date AS STRING) AS date, year, event_name, athletics_event, round, place, mark_display,
      division_key_resolved AS competition_level, ROUND(competition_score, 0) AS competition_score,
      NULLIF(record, '') AS record, city, country, wind, wind_legal,
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
  city: string | null;
  country: string | null;
  wind: string | null;
  wind_legal: boolean | null;
};

export type PodiumEntry = {
  place: number;
  mark_display: string;
  nationality: string | null;
  record: string | null;
  wind: string | null;
  wind_legal: boolean | null;
  athletes: { athlete_id: string | null; display_name: string }[];
};

export type Race = {
  key: string;
  event_name: string;
  athletics_event: string;
  gender: string;
  date: string;
  competition_level: string | null;
  city: string | null;
  country: string | null;
  top3: PodiumEntry[];
};

export async function getLatestRaces(
  maxRaces = 10,
  filters: { event?: string; tier?: string; nationality?: string } = {}
): Promise<Race[]> {
  const { event, tier, nationality } = filters;
  // The source "place" field is heat-relative, not race-relative -- meets
  // that run many parallel non-eliminating heats (all labelled some variant
  // of "Final") each produce their own place 1/2/3, which would otherwise
  // flood a single race with dozens of "podium" rows. For individual events
  // we ignore the source place and rank by the actual mark ourselves,
  // capped to the real top 3. Relays keep the source place (it already
  // identifies one row per team leg correctly).
  const rows = await runQuery<ResultRow>(`
    WITH candidates AS (
      SELECT
        event_name, athletics_event, gender,
        CAST(date AS STRING) AS date,
        division_key_resolved AS competition_level,
        place, athlete_id, athlete_display_name AS display_name, mark_display,
        nationality, NULLIF(record, '') AS record, city, country, wind, wind_legal,
        mark_seconds, SAFE_CAST(mark AS FLOAT64) AS mark_num,
        LOWER(athletics_event) LIKE '%relay%' AS is_relay
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE place IS NOT NULL
        AND (round IS NULL OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%'))
        AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
        AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
        AND athlete_display_name IS NOT NULL
        AND (mark_seconds IS NOT NULL OR SAFE_CAST(mark AS FLOAT64) IS NOT NULL)
        ${event ? "AND athletics_event = @event" : ""}
        ${tier ? "AND division_key_resolved = @tier" : ""}
    ),
    ranked AS (
      SELECT *,
        IF(is_relay, place, RANK() OVER (
          PARTITION BY event_name, athletics_event, gender, date
          ORDER BY IF(
            athletics_event IN ('Long Jump','High Jump','Triple Jump','Pole Vault','Shot Put','Discus Throw','Javelin Throw','Hammer Throw'),
            -mark_num, mark_seconds
          ) ASC
        )) AS real_place
      FROM candidates
    )
    SELECT event_name, athletics_event, gender, date, competition_level,
      real_place AS place, athlete_id, display_name, mark_display, nationality, record, city, country, wind, wind_legal
    FROM ranked
    WHERE real_place BETWEEN 1 AND 3
    ORDER BY date DESC
  `, { ...(event ? { event } : {}), ...(tier ? { tier } : {}) });

  // Group into races, then within each race group by place -- a relay
  // team has one row per runner sharing the same place/mark/nationality,
  // and those must collapse into a single podium entry with a roster,
  // not one row per runner. Individual events never collapse like this,
  // even when two athletes from the same country tie for the same place.
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
        city: r.city,
        country: r.country,
        top3: [],
      };
      races.set(key, race);
      podiumsByRace.set(key, new Map());
    }

    const isRelay = r.athletics_event?.toLowerCase().includes("relay");
    const podiums = podiumsByRace.get(key)!;
    const podiumKey = isRelay ? `${r.place}|${r.nationality ?? ""}` : `${r.place}|${r.athlete_id ?? r.display_name}`;
    let entry = podiums.get(podiumKey);
    if (!entry) {
      entry = { place: r.place, mark_display: r.mark_display, nationality: r.nationality, record: r.record, wind: r.wind, wind_legal: r.wind_legal, athletes: [] };
      podiums.set(podiumKey, entry);
      race.top3.push(entry);
    }
    entry.athletes.push({ athlete_id: r.athlete_id, display_name: r.display_name });
  }

  let list = Array.from(races.values());
  for (const race of list) race.top3.sort((a, b) => a.place - b.place);
  // Nationality filtering happens here, after the real top-3 is computed --
  // it keeps races where that nationality actually medaled (with the full
  // podium still shown for context), rather than re-ranking within just
  // that nationality's subset (which would misrepresent who actually won).
  if (nationality) {
    list = list.filter((race) => race.top3.some((entry) => entry.nationality === nationality));
  }
  // Most recent first (this is "Latest Results") -- competition tier only
  // breaks ties between races on the same date.
  list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return tierPriority(a.competition_level) - tierPriority(b.competition_level);
  });
  return list.slice(0, maxRaces);
}

export async function getLatestResultsNationalities(): Promise<NationalityOption[]> {
  return runQuery<NationalityOption>(`
    WITH codes AS (
      SELECT DISTINCT nationality AS code
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY) AND nationality IS NOT NULL
    ),
    names AS (
      SELECT Codigo AS code, ANY_VALUE(Pais) AS name
      FROM \`athletics-database.tablasauxiliares.paises_traduccion_codigos_v2\`
      GROUP BY Codigo
    )
    SELECT c.code, IFNULL(n.name, c.code) AS name
    FROM codes c
    LEFT JOIN names n USING (code)
    ORDER BY name
  `);
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

export async function getUpcomingCompetitions(limit = 10, category?: string): Promise<UpcomingCompetition[]> {
  return runQuery<UpcomingCompetition>(`
    SELECT
      CAST(date_start AS STRING) AS date_start,
      CAST(date_end AS STRING) AS date_end,
      name, venue, country, category, disciplines
    FROM \`athletics-database.tablasauxiliares.upcoming_competitions\`
    WHERE date_start >= CURRENT_DATE()
      AND category IN ${category ? "(@category)" : "('OW','DF','GW','GL','A','B')"}
    ORDER BY date_start ASC
    LIMIT ${limit}
  `, category ? { category } : {});
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
  birth_year: number | null;
  best_mark: string | null;
  best_mark_value: number | null;
  best_mark_wind: string | null;
  best_mark_wind_legal: boolean | null;
};

// Standard World Athletics age categories: age is measured as of Dec 31
// of the competition year. Senior = no restriction.
export const AGE_CATEGORIES: Record<string, number> = { U18: 17, U20: 19, U23: 22 };

function rankingAggCte(event: string, year: number | "all", ageMax: number | undefined, isField: boolean, markOrderExpr: string, hasNationality: boolean, excludeIllegalWind: boolean) {
  // By default, wind-illegal results are dropped entirely before
  // aggregation (same convention as All-Time Best / Best of year) -- an
  // athlete whose only results that year were wind-aided simply doesn't
  // appear, and a mixed athlete's points/best mark only reflect their
  // legal results. Toggling this off lets every result count normally.
  return `
    SELECT
      athlete_id, ANY_VALUE(athlete_display_name) AS display_name,
      ROUND(SUM(competition_score), 0) AS points,
      COUNT(*) AS n_results,
      ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
      ARRAY_AGG(birth_year IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS birth_year,
      ARRAY_AGG(mark_display IGNORE NULLS ORDER BY ${markOrderExpr} LIMIT 1)[SAFE_OFFSET(0)] AS best_mark,
      ARRAY_AGG(${isField ? "SAFE_CAST(mark AS FLOAT64)" : "mark_seconds"} IGNORE NULLS ORDER BY ${markOrderExpr} LIMIT 1)[SAFE_OFFSET(0)] AS best_mark_value,
      ARRAY_AGG(wind IGNORE NULLS ORDER BY ${markOrderExpr} LIMIT 1)[SAFE_OFFSET(0)] AS best_mark_wind,
      ARRAY_AGG(wind_legal ORDER BY ${markOrderExpr} LIMIT 1)[SAFE_OFFSET(0)] AS best_mark_wind_legal
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE ${year !== "all" ? `year = ${year} AND` : ""} athletics_event = @event AND gender = @gender
      AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
      ${hasNationality ? "AND nationality = @nationality" : ""}
      ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
      ${excludeIllegalWind ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
    GROUP BY athlete_id
  `;
}

export async function getEventYearRanking(
  event: string,
  gender: string,
  year: number | "all",
  page = 1,
  pageSize = 50,
  filters: { nationality?: string; ageCategory?: string; sortBy?: "points" | "mark"; includeIllegalWind?: boolean } = {}
): Promise<RankingRow[]> {
  const { nationality, ageCategory, sortBy = "mark", includeIllegalWind = false } = filters;
  // Age is checked per result row (that row's own `year` vs birth_year),
  // not against a single reference year -- so it works for "all" years
  // too: e.g. "all-time U20" sums only the results scored while the
  // athlete actually was U20, across their whole career.
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const isField = isFieldEvent(event);
  const markOrderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const outerOrder =
    sortBy === "mark"
      ? `best_mark_value IS NULL, ${isField ? "best_mark_value DESC" : "best_mark_value ASC"}`
      : "points DESC";
  return runQuery<RankingRow>(`
    WITH agg AS (${rankingAggCte(event, year, ageMax, isField, markOrderExpr, !!nationality, !includeIllegalWind)})
    SELECT * FROM agg
    ORDER BY ${outerOrder}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, { event, gender, ...(nationality ? { nationality } : {}) });
}

export async function getEventYearRankingCount(
  event: string,
  gender: string,
  year: number | "all",
  filters: { nationality?: string; ageCategory?: string; includeIllegalWind?: boolean } = {}
): Promise<number> {
  const { nationality, ageCategory, includeIllegalWind = false } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const isField = isFieldEvent(event);
  const markOrderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const rows = await runQuery<{ n: number }>(`
    WITH agg AS (${rankingAggCte(event, year, ageMax, isField, markOrderExpr, !!nationality, !includeIllegalWind)})
    SELECT COUNT(*) AS n FROM agg
  `, { event, gender, ...(nationality ? { nationality } : {}) });
  return rows[0]?.n ?? 0;
}

export type NationalityOption = { code: string; name: string };

export async function getAvailableNationalities(event: string, gender: string, year: number | "all"): Promise<NationalityOption[]> {
  return runQuery<NationalityOption>(`
    WITH codes AS (
      SELECT DISTINCT nationality AS code
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE ${year !== "all" ? `year = ${year} AND` : ""} athletics_event = @event AND gender = @gender AND nationality IS NOT NULL
    ),
    names AS (
      SELECT Codigo AS code, ANY_VALUE(Pais) AS name
      FROM \`athletics-database.tablasauxiliares.paises_traduccion_codigos_v2\`
      GROUP BY Codigo
    )
    SELECT c.code, IFNULL(n.name, c.code) AS name
    FROM codes c
    LEFT JOIN names n USING (code)
    ORDER BY name
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

// ---------------------------------------------------------------------
// Relay events: one row per team-performance (all legs of a team on a
// given day collapsed into a single roster), best team time per nation.
// ---------------------------------------------------------------------

export type RelayMarkRow = {
  nationality: string | null;
  mark_display: string;
  event_name: string;
  date: string;
  roster: string[];
  record: string | null;
};

export async function getEventAllTimeBestRelay(event: string, gender: string, limit = 10): Promise<RelayMarkRow[]> {
  return runQuery<RelayMarkRow>(`
    WITH teams AS (
      SELECT event_name, CAST(date AS STRING) AS date, nationality, mark_display, mark_seconds,
        ARRAY_AGG(DISTINCT athlete_display_name IGNORE NULLS ORDER BY athlete_display_name) AS roster,
        ANY_VALUE(NULLIF(record, '')) AS record
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athletics_event = @event AND gender = @gender
        AND nationality IS NOT NULL AND mark_seconds IS NOT NULL
      GROUP BY event_name, date, nationality, mark_display, mark_seconds
    )
    SELECT event_name, date, nationality, mark_display, roster, record
    FROM teams
    QUALIFY ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY mark_seconds ASC) = 1
    ORDER BY mark_seconds ASC
    LIMIT ${limit}
  `, { event, gender });
}

export async function getEventYearBestMarksRelay(
  event: string,
  gender: string,
  year: number,
  limit = 10
): Promise<RelayMarkRow[]> {
  return runQuery<RelayMarkRow>(`
    WITH teams AS (
      SELECT event_name, CAST(date AS STRING) AS date, nationality, mark_display, mark_seconds,
        ARRAY_AGG(DISTINCT athlete_display_name IGNORE NULLS ORDER BY athlete_display_name) AS roster,
        ANY_VALUE(NULLIF(record, '')) AS record
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE year = ${year} AND athletics_event = @event AND gender = @gender
        AND nationality IS NOT NULL AND mark_seconds IS NOT NULL
      GROUP BY event_name, date, nationality, mark_display, mark_seconds
    )
    SELECT event_name, date, nationality, mark_display, roster, record
    FROM teams
    QUALIFY ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY mark_seconds ASC) = 1
    ORDER BY mark_seconds ASC
    LIMIT ${limit}
  `, { event, gender });
}

// ---------------------------------------------------------------------
// Meet page: full results for one competition (by its event_name), with
// an available-years list so different editions of the same meet can be
// browsed (e.g. "Prefontaine Classic" 2019, 2020, 2021...).
// ---------------------------------------------------------------------

export async function getMeetAvailableYears(eventName: string): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE event_name = @eventName AND year IS NOT NULL
    ORDER BY year DESC
  `, { eventName });
  return rows.map((r) => r.year);
}

export type MeetResultRow = {
  athletics_event: string;
  gender: string;
  place: number | null;
  athlete_id: string | null;
  display_name: string;
  mark_display: string;
  nationality: string | null;
  record: string | null;
  city: string | null;
  country: string | null;
  date: string | null;
  wind: string | null;
  wind_legal: boolean | null;
};

export async function getMeetResults(eventName: string, year: number): Promise<MeetResultRow[]> {
  return runQuery<MeetResultRow>(`
    SELECT athletics_event, gender, place, athlete_id,
      athlete_display_name AS display_name, mark_display, nationality,
      NULLIF(record, '') AS record, city, country, CAST(date AS STRING) AS date, wind, wind_legal
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE event_name = @eventName AND year = @year
      AND (round IS NULL OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%'))
      AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
      AND athlete_display_name IS NOT NULL
    ORDER BY athletics_event, gender, place ASC NULLS LAST
  `, { eventName, year });
}
