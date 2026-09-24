import { runQuery } from "./bigquery";
import { tierPriority, isFieldEvent } from "./events";

// Indoor vs outdoor isn't a naming difference (both use the exact same
// athletics_event, e.g. "1500 Metres") -- it's a real, separate ranking
// context in the sport (separate world records exist per venue type), so
// mixing them into one "best mark" is wrong for any event contested in
// both. Only `track_key = 'Short Track'` (populated for worldathletics
// rows only) reliably says "indoor"; dlmeetings/sports123 never populate
// it. A residual few hundred more can be recovered when the competition's
// own name says "Indoor" (checked: only ~1.5k rows site-wide, not a real
// substitute for the missing column). Everything else defaults to
// outdoor, since that's the far more common case and the source gives no
// signal either way.
const INDOOR_EXPR = `(track_key = 'Short Track' OR LOWER(event_name) LIKE '%indoor%')`;

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
  event_name: string; // one representative edition of this medal, for the meet-page link
  series_name: string; // grouped series (e.g. "World Championships"), for display
  place: 1 | 2 | 3; // exact medal colour -- never mixed with other colours in one row
  n: number; // how many times they got exactly this medal in this discipline+series
  years: number[]; // one entry per time, most recent first
};

// A palmares, not a highlight reel: grouped by discipline + series + EXACT
// place, so "2x gold" and "1x silver" at the same series are two separate
// lines, never blended into one ambiguous row. Only podium finishes count
// (place 1-3) -- a 7th place at the Olympics doesn't belong in a trophy
// cabinet even if it outscored some smaller win. Ranked by total points
// (summed across every time they got that exact medal here) -- NOT by
// medal colour first, since that would rank 5 national-championship golds
// above 2 World Championships silvers, which is backwards. The competition
// tier's points already encode how much a given win/medal is worth.
//
// Series grouped by the normalized key (see normalizeSeries) so a rebrand
// or host-city suffix doesn't split the same real title into two lines.
export async function getAthleteBestResults(athleteId: string, limit = 5): Promise<BestResultRow[]> {
  return runQuery<BestResultRow>(`
    WITH scored AS (
      SELECT athletics_event, gender, event_name,
        COALESCE(display_series_name, event_name) AS series_name,
        year, place, competition_score
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND competition_score IS NOT NULL AND place BETWEEN 1 AND 3
    ),
    per_edition AS (
      -- One row per (discipline, NORMALIZED series, year, place) -- not
      -- grouped by the raw series_name, or the same real edition spelled
      -- two different ways in the source (e.g. "Iaaf World Championships"
      -- vs "...In Athletics" for the very same year) would survive as two
      -- separate rows here, and the outer ARRAY_AGG(year) below would then
      -- list that year twice. Collapses heats/rounds too.
      SELECT athletics_event, gender,
        ${normalizeSeries("series_name")} AS series_key,
        year, place,
        ARRAY_AGG(
          STRUCT(event_name, series_name, competition_score)
          ORDER BY competition_score DESC LIMIT 1
        )[OFFSET(0)] AS best
      FROM scored
      GROUP BY athletics_event, gender, series_key, year, place
    ),
    grouped AS (
      SELECT athletics_event, gender, series_key, place, COUNT(*) AS n,
        SUM(best.competition_score) AS total_points,
        ARRAY_AGG(year ORDER BY year DESC) AS years,
        -- Display name keeps its real casing, with org-branding
        -- ("Iaaf "/"World Athletics ") and the trailing ", <city>"
        -- stripped, from whichever edition scored highest.
        ARRAY_AGG(
          STRUCT(best.event_name AS event_name,
            ${displaySeries("best.series_name")} AS display_series_name)
          ORDER BY best.competition_score DESC LIMIT 1
        )[OFFSET(0)] AS top
      FROM per_edition
      GROUP BY athletics_event, gender, series_key, place
    )
    SELECT athletics_event, gender, top.display_series_name AS series_name, place, n, years,
      top.event_name AS event_name
    FROM grouped
    ORDER BY total_points DESC
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
  wind: string | null;
  wind_legal: boolean | null;
};

// Personal bests, each annotated with the athlete's all-time world rank in
// that discipline+gender (rank among every athlete's own personal best --
// same "one entry per athlete" rule as getEventAllTimeBest). Restricted via
// a join to only the handful of disciplines this athlete has a PB in, so it
// doesn't rank the entire table.
export async function getAthletePersonalBests(
  athleteId: string,
  includeIllegalWind = false,
  indoor = false
): Promise<PersonalBestRow[]> {
  // By default (matching Rankings), a wind-illegal result is excluded from
  // an athlete's personal best entirely -- if their only mark in a wind-
  // affected discipline was illegal, that discipline just doesn't appear.
  const windFilter = includeIllegalWind ? "" : "AND (wind_legal IS NULL OR wind_legal = TRUE)";
  // Same treatment as Rankings: outdoor by default, indoor is a separate
  // explicit view, never blended (separate world records exist per venue).
  const indoorFilter = `AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}`;
  return runQuery<PersonalBestRow>(`
    WITH my_pbs AS (
      SELECT athletics_event, gender, mark_display, event_name, year, wind, wind_legal, mark_seconds AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event ORDER BY mark_seconds ASC) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND mark_seconds IS NOT NULL ${windFilter} ${indoorFilter}
      UNION ALL
      SELECT athletics_event, gender, mark_display, event_name, year, wind, wind_legal, SAFE_CAST(mark AS FLOAT64) AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event ORDER BY SAFE_CAST(mark AS FLOAT64) DESC) AS rk
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE athlete_id = @athleteId AND mark_seconds IS NULL AND SAFE_CAST(mark AS FLOAT64) IS NOT NULL ${windFilter} ${indoorFilter}
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
        ${windFilter} ${indoorFilter}
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
    SELECT p.athletics_event, p.gender, p.mark_display, p.event_name, p.year,
      p.wind, p.wind_legal, r.rnk AS all_time_rank
    FROM my_pbs p
    LEFT JOIN ranked r
      ON r.athletics_event = p.athletics_event AND r.gender = p.gender AND r.athlete_id = @athleteId
    WHERE p.rk = 1
    ORDER BY r.rnk ASC NULLS LAST
  `, { athleteId });
}

export type YearPointsRow = { year: number; points: number; n_results: number; wins: number; rank: number | null };

// Total points per year (summed across every discipline), each annotated
// with the athlete's rank that year among all athletes of the same gender
// by total annual points -- an overall "how good was this athlete's year"
// ranking, not a per-discipline one.
export async function getAthleteYearlyPoints(athleteId: string, gender: string): Promise<YearPointsRow[]> {
  return runQuery<YearPointsRow>(`
    WITH my_totals AS (
      SELECT year, ROUND(SUM(competition_score), 0) AS points, COUNT(*) AS n_results,
        COUNTIF(place = 1) AS wins
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
    SELECT t.year, t.points, t.n_results, t.wins, r.rnk AS rank
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
  // event === "all" shows every discipline for the year(s) selected -- mark
  // values then mix seconds and metres, so mark_value/isField only matters
  // (and only gets used for sorting) in the single-discipline case.
  const isField = isFieldEvent(event);
  return runQuery<AthleteYearResultRow>(`
    SELECT CAST(date AS STRING) AS date, year, event_name, athletics_event, round, place, mark_display,
      division_key_resolved AS competition_level, ROUND(competition_score, 0) AS competition_score,
      NULLIF(record, '') AS record, city, country, wind, wind_legal,
      ${isField ? "SAFE_CAST(mark AS FLOAT64)" : "mark_seconds"} AS mark_value
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id = @athleteId
      ${event !== "all" ? "AND athletics_event = @event" : ""}
      ${year !== "all" ? "AND year = @year" : ""}
    ORDER BY competition_score DESC NULLS LAST, date DESC
  `, { athleteId, ...(event !== "all" ? { event } : {}), ...(year !== "all" ? { year } : {}) });
}

// ---------------------------------------------------------------------
// Latest results, grouped into races (competition + event + gender) with
// the top 3 finishers each, ordered by competition tier first.
// ---------------------------------------------------------------------

export type ResultRow = {
  event_name: string;
  athletics_event: string;
  gender: string;
  round: string | null;
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
  round: string | null;
  date: string;
  competition_level: string | null;
  city: string | null;
  country: string | null;
  top3: PodiumEntry[];
};

export async function getLatestRaces(
  maxRaces = 10,
  filters: { event?: string; tier?: string } = {}
): Promise<Race[]> {
  const { event, tier } = filters;
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
        event_name, athletics_event, gender, round,
        CAST(date AS STRING) AS date,
        division_key_resolved AS competition_level,
        place, athlete_id, athlete_display_name AS display_name, mark_display,
        nationality, NULLIF(record, '') AS record, city, country, wind, wind_legal,
        mark_seconds, SAFE_CAST(mark AS FLOAT64) AS mark_num,
        LOWER(athletics_event) LIKE '%relay%' AS is_relay
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE place IS NOT NULL
        AND (round IS NULL OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%' AND LOWER(round) NOT LIKE '%quarterfinal%'))
        AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
        AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
        AND athlete_display_name IS NOT NULL
        AND (mark_seconds IS NOT NULL OR SAFE_CAST(mark AS FLOAT64) IS NOT NULL)
        ${event ? "AND athletics_event = @event" : ""}
        ${tier ? "AND division_key_resolved = @tier" : ""}
    ),
    ranked AS (
      SELECT *,
        -- Partitioned by round too: some meets split a discipline into
        -- parallel sections ("Final 1"/"Final 2", by pace/seed), each with
        -- its own real place 1/2/3 -- without this they'd get ranked
        -- against each other as if it were one race. Also by wind: some
        -- sources (confirmed on worldathletics) run two parallel sections
        -- BOTH labelled just "Final" with no other distinguishing text --
        -- but a single real race only ever has one wind reading, so two
        -- different non-null wind values under the same round means two
        -- different races got merged.
        IF(is_relay, place, RANK() OVER (
          PARTITION BY event_name, athletics_event, gender, date, round, wind
          ORDER BY IF(
            athletics_event IN ('Long Jump','High Jump','Triple Jump','Pole Vault','Shot Put','Discus Throw','Javelin Throw','Hammer Throw'),
            -mark_num, mark_seconds
          ) ASC
        )) AS real_place
      FROM candidates
    )
    SELECT event_name, athletics_event, gender, round, date, competition_level,
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
    const key = `${r.event_name}|${r.athletics_event}|${r.gender}|${r.date}|${r.round ?? ""}|${r.wind ?? ""}`;
    let race = races.get(key);
    if (!race) {
      race = {
        key,
        event_name: r.event_name,
        athletics_event: r.athletics_event,
        gender: r.gender,
        round: r.round,
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

function rankingAggCte(event: string, year: number | "all", ageMax: number | undefined, isField: boolean, markOrderExpr: string, hasNationality: boolean, excludeIllegalWind: boolean, indoor: boolean) {
  // By default, wind-illegal results are dropped entirely before
  // aggregation (same convention as All-Time Best / Best of year) -- an
  // athlete whose only results that year were wind-aided simply doesn't
  // appear, and a mixed athlete's points/best mark only reflect their
  // legal results. Toggling this off lets every result count normally.
  // Indoor/outdoor works the same way: outdoor is the default view (the
  // far more common context, and "the" record for most events), indoor
  // is a separate, explicit view -- never blended in the same ranking.
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
      AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
    GROUP BY athlete_id
  `;
}

export async function getEventYearRanking(
  event: string,
  gender: string,
  year: number | "all",
  page = 1,
  pageSize = 50,
  filters: { nationality?: string; ageCategory?: string; sortBy?: "points" | "mark"; includeIllegalWind?: boolean; indoor?: boolean } = {}
): Promise<RankingRow[]> {
  const { nationality, ageCategory, sortBy = "mark", includeIllegalWind = false, indoor = false } = filters;
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
    WITH agg AS (${rankingAggCte(event, year, ageMax, isField, markOrderExpr, !!nationality, !includeIllegalWind, indoor)})
    SELECT * FROM agg
    ORDER BY ${outerOrder}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, { event, gender, ...(nationality ? { nationality } : {}) });
}

export async function getEventYearRankingCount(
  event: string,
  gender: string,
  year: number | "all",
  filters: { nationality?: string; ageCategory?: string; includeIllegalWind?: boolean; indoor?: boolean } = {}
): Promise<number> {
  const { nationality, ageCategory, includeIllegalWind = false, indoor = false } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const isField = isFieldEvent(event);
  const markOrderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const rows = await runQuery<{ n: number }>(`
    WITH agg AS (${rankingAggCte(event, year, ageMax, isField, markOrderExpr, !!nationality, !includeIllegalWind, indoor)})
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
// Relay year ranking -- team-by-nationality, not athlete-by-athlete.
// events_enriched has one row per roster member per race, all sharing the
// team's own mark/place/score, so the Rankings page's normal per-athlete
// query would list each named leg separately (and however many legs
// happened to get matched to an athlete profile for a given race, since
// that's not always all 4). Collapsed into one row per team-race first,
// same as the event page's All-Time Best relay list, before aggregating.
// ---------------------------------------------------------------------

export type RelayRankingRow = {
  nationality: string;
  points: number;
  n_results: number;
  best_mark: string | null;
  best_mark_value: number | null;
  roster: string[];
  record: string | null;
};

function relayRankingAggCte(event: string, year: number | "all", hasNationality: boolean) {
  return `
    WITH races AS (
      SELECT event_name, CAST(date AS STRING) AS date, nationality, mark_display, mark_seconds, competition_score,
        ARRAY_AGG(DISTINCT athlete_display_name IGNORE NULLS ORDER BY athlete_display_name) AS roster,
        ANY_VALUE(NULLIF(record, '')) AS record
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE ${year !== "all" ? `year = ${year} AND` : ""} athletics_event = @event AND gender = @gender
        AND nationality IS NOT NULL AND mark_seconds IS NOT NULL
        ${hasNationality ? "AND nationality = @nationality" : ""}
      GROUP BY event_name, date, nationality, mark_display, mark_seconds, competition_score
    ),
    totals AS (
      SELECT nationality, ROUND(SUM(competition_score), 0) AS points, COUNT(*) AS n_results
      FROM races
      GROUP BY nationality
    ),
    best AS (
      SELECT nationality, mark_display AS best_mark, mark_seconds AS best_mark_value, roster, record
      FROM races
      QUALIFY ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY mark_seconds ASC) = 1
    )
    SELECT t.nationality, t.points, t.n_results, b.best_mark, b.best_mark_value, b.roster, b.record
    FROM totals t
    JOIN best b USING (nationality)
  `;
}

export async function getRelayYearRanking(
  event: string,
  gender: string,
  year: number | "all",
  page = 1,
  pageSize = 50,
  filters: { nationality?: string; sortBy?: "points" | "mark" } = {}
): Promise<RelayRankingRow[]> {
  const { nationality, sortBy = "mark" } = filters;
  const outerOrder = sortBy === "mark" ? "best_mark_value IS NULL, best_mark_value ASC" : "points DESC";
  return runQuery<RelayRankingRow>(`
    WITH agg AS (${relayRankingAggCte(event, year, !!nationality)})
    SELECT * FROM agg
    ORDER BY ${outerOrder}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, { event, gender, ...(nationality ? { nationality } : {}) });
}

export async function getRelayYearRankingCount(
  event: string,
  gender: string,
  year: number | "all",
  filters: { nationality?: string } = {}
): Promise<number> {
  const { nationality } = filters;
  const rows = await runQuery<{ n: number }>(`
    WITH agg AS (${relayRankingAggCte(event, year, !!nationality)})
    SELECT COUNT(*) AS n FROM agg
  `, { event, gender, ...(nationality ? { nationality } : {}) });
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------
// Global ranking: total points across every discipline for a year, same
// gender -- what "Points by Year" on an athlete's page actually reflects,
// so its links land here instead of on a single (and somewhat arbitrary)
// discipline's ranking.
// ---------------------------------------------------------------------

export type GlobalRankingRow = {
  athlete_id: string;
  display_name: string;
  points: number;
  n_results: number;
  nationality: string | null;
  birth_year: number | null;
};

function globalRankingAggCte(year: number | "all", ageMax: number | undefined, hasNationality: boolean) {
  return `
    SELECT
      athlete_id, ANY_VALUE(athlete_display_name) AS display_name,
      ROUND(SUM(competition_score), 0) AS points,
      COUNT(*) AS n_results,
      ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality,
      ARRAY_AGG(birth_year IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS birth_year
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE ${year !== "all" ? `year = ${year} AND` : ""} gender = @gender
      AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
      ${hasNationality ? "AND nationality = @nationality" : ""}
      ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
    GROUP BY athlete_id
  `;
}

export async function getGlobalYearRanking(
  gender: string,
  year: number | "all",
  page = 1,
  pageSize = 50,
  filters: { nationality?: string; ageCategory?: string } = {}
): Promise<GlobalRankingRow[]> {
  const { nationality, ageCategory } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  return runQuery<GlobalRankingRow>(`
    WITH agg AS (${globalRankingAggCte(year, ageMax, !!nationality)})
    SELECT * FROM agg
    ORDER BY points DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, { gender, ...(nationality ? { nationality } : {}) });
}

export async function getGlobalYearRankingCount(
  gender: string,
  year: number | "all",
  filters: { nationality?: string; ageCategory?: string } = {}
): Promise<number> {
  const { nationality, ageCategory } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const rows = await runQuery<{ n: number }>(`
    WITH agg AS (${globalRankingAggCte(year, ageMax, !!nationality)})
    SELECT COUNT(*) AS n FROM agg
  `, { gender, ...(nationality ? { nationality } : {}) });
  return rows[0]?.n ?? 0;
}

export async function getGlobalAvailableNationalities(gender: string, year: number | "all"): Promise<NationalityOption[]> {
  return runQuery<NationalityOption>(`
    WITH codes AS (
      SELECT DISTINCT nationality AS code
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE ${year !== "all" ? `year = ${year} AND` : ""} gender = @gender AND nationality IS NOT NULL
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
  `, { gender });
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

export async function getEventAllTimeBest(
  event: string, gender: string, limit = 10, ageCategory?: string, indoor = false
): Promise<MarkRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;

  return runQuery<MarkRow>(`
    SELECT athlete_id, athlete_display_name AS display_name, mark_display, event_name, CAST(date AS STRING) AS date, nationality,
      NULLIF(record, '') AS record
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athletics_event = @event AND gender = @gender
      AND athlete_display_name IS NOT NULL
      AND ${isField ? "SAFE_CAST(mark AS FLOAT64) IS NOT NULL" : "mark_seconds IS NOT NULL"}
      ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
      ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
      AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
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
  limit = 10,
  ageCategory?: string,
  indoor = false
): Promise<MarkRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;

  return runQuery<MarkRow>(`
    SELECT athlete_id, athlete_display_name AS display_name, mark_display, event_name, CAST(date AS STRING) AS date, nationality,
      NULLIF(record, '') AS record
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE year = ${year} AND athletics_event = @event AND gender = @gender
      AND athlete_display_name IS NOT NULL
      AND ${isField ? "SAFE_CAST(mark AS FLOAT64) IS NOT NULL" : "mark_seconds IS NOT NULL"}
      ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
      ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
      AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
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

// Editions of the same meet series often carry an ordinal prefix that
// differs by year ("The XXVI Olympic Games", "The XXXIII Olympic Games")
// even though it's the same recurring competition. events_enriched
// already has this resolved via display_series_name (curated upstream,
// covers ~99.9998% of rows) -- match on that instead of the literal
// event_name, so any edition's link resolves to the same meet page and
// the year selector there can list every edition.
//
// display_series_name itself doesn't bridge the IAAF -> World Athletics
// rebrand (2019) though: "Iaaf World Cross Country Championships" and
// "World Athletics Cross Country Championships" are two different values
// for the same real competition, so a plain equality match silently
// truncates history at the rebrand (verified: several championship
// series split this way -- Cross Country, Indoor, Half Marathon, Road
// Running, Relays, Race Walking Team, plus the flagship "World
// Championships" itself). Stripping the "Iaaf"/"World Athletics"/leading
// "World" org-name prefixes before comparing reunites them without
// merging unrelated series (checked against the full distinct list).
//
// Since 2022, "World Championships" editions also carry a host-city
// suffix ("World Athletics Championships, Budapest"/", Oregon"/", Tokyo")
// that's unique per edition, so even among themselves they never merged.
// Stripping ", <city>" is only safe when it follows "Championships" --
// checked against every display_series_name containing a comma site-wide,
// most legitimately use commas for other things (age categories, meet
// names) and must NOT be touched.
export const normalizeSeries = (expr: string) => `
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            -- "Iaaf" shows up anywhere in the name across sources, not
            -- just as a leading prefix (e.g. "Shanghai Iaaf Diamond
            -- League" vs "Shanghai Diamond League") -- strip it as a
            -- standalone word wherever it lands, not just at the start.
            REGEXP_REPLACE(LOWER(TRIM(${expr})), r'\\biaaf\\b\\s*', ''),
            r'^world athletics\\s+', ''
          ),
          r'^world\\s+', ''
        ),
        -- Some sources tack a generic "Meeting" suffix onto an otherwise
        -- matching name ("Shanghai Iaaf Diamond League Meeting").
        r'\\s+meeting$', ''
      ),
      r'(championships),\\s+.*$', r'\\1'
    ),
    -- "Iaaf World Championships In Athletics" is yet another spelling of
    -- the same flagship title (some 1990s/2000s editions), checked against
    -- every "...Championships In Athletics" series site-wide before adding
    -- this -- the others ("Toyama Championships In Athletics" etc.) keep
    -- their own distinguishing name before "Championships" and don't merge.
    r'(?i)(championships)\\s+in athletics$', r'\\1'
  ))
`;

// Same rebrand/city-suffix cleanup as normalizeSeries, but for DISPLAY --
// keeps real casing and the actual event word ("World Championships"),
// only stripping the organisational branding ("Iaaf"/"World Athletics")
// that shouldn't show up next to a name already grouped past it. Used
// wherever a grouped series (not one specific edition) is shown, e.g.
// Top Results -- "By Year" deliberately keeps the exact edition name
// instead, since each of its rows is one specific competition, not a
// summary of several.
export const displaySeries = (expr: string) => `
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(TRIM(${expr}), r'(?i)\\biaaf\\b\\s*', ''),
          r'(?i)^world athletics\\s+', 'World '
        ),
        r'(?i)\\s+meeting$', ''
      ),
      r'(?i)(championships),\\s+.*$', r'\\1'
    ),
    r'(?i)(championships)\\s+in athletics$', r'\\1'
  ))
`;

// Falls back to a plain event_name match for the handful of rows with no
// series data.
const MEET_SERIES_MATCH_SQL = `
  (
    (
      display_series_name IS NOT NULL
      AND ${normalizeSeries("display_series_name")} = (
        SELECT ${normalizeSeries("ANY_VALUE(display_series_name)")}
        FROM \`athletics-database.athletics_all.events_enriched\`
        WHERE event_name = @eventName
      )
    )
    OR event_name = @eventName
  )
`;

export async function getMeetAvailableYears(eventName: string): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE ${MEET_SERIES_MATCH_SQL} AND year IS NOT NULL
    ORDER BY year DESC
  `, { eventName });
  return rows.map((r) => r.year);
}

export type MeetResultRow = {
  event_name: string;
  series_name: string; // generic series name (e.g. "World Athletics Cross Country Championships"), no per-edition ordinal
  athletics_event: string;
  gender: string;
  round: string | null; // e.g. "Final 1"/"Final 2" for meets that split a discipline into parallel sections
  place: number | null;
  athlete_id: string | null;
  display_name: string;
  mark_display: string;
  mark_value: number | null; // mark_seconds for track, raw mark for field -- used only to split same-place parallel sections when there's no wind to split by
  nationality: string | null;
  record: string | null;
  city: string | null;
  country: string | null;
  date: string | null;
  wind: string | null;
  wind_legal: boolean | null;
  division_key_resolved: string | null;
};

// NOTE: some historical sources (mainly dlmeetings) run several unlabelled
// heats of the same event under one meet+date with no round to tell them
// apart, so the same athlete can show up twice with two different places/
// marks and no way to know which (if either) was the real final. Ranking
// everyone by raw mark across those merged rounds was tried and reverted --
// it fabricates a placing that can be flat wrong (a semifinal time beating
// the actual final winner would falsely "win" the page). Better to keep the
// source's own place per row, even if two rows for the same athlete can't
// be told apart, than to assert an order we don't actually know.
//
// Separately, most real conflicts (confirmed against the source scrape) are
// meets that split a discipline into parallel sections -- "Final 1"/
// "Final 2" -- each with its own real place 1/2/3. Both match '%final%' so
// they used to get merged into one fake ranking. `round` is selected here
// so the page can group by it and render each section on its own instead.
export async function getMeetResults(eventName: string, year: number): Promise<MeetResultRow[]> {
  return runQuery<MeetResultRow>(`
    SELECT event_name, COALESCE(display_series_name, event_name) AS series_name,
      athletics_event, gender, round, place, athlete_id,
      athlete_display_name AS display_name, mark_display,
      IF(athletics_discipline IN ('Jumps','Throws'), SAFE_CAST(mark AS FLOAT64), mark_seconds) AS mark_value,
      nationality,
      NULLIF(record, '') AS record, city, country, CAST(date AS STRING) AS date, wind, wind_legal,
      division_key_resolved
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE ${MEET_SERIES_MATCH_SQL} AND year = @year
      AND (round IS NULL OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%' AND LOWER(round) NOT LIKE '%quarterfinal%'))
      AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
      AND athlete_display_name IS NOT NULL
    ORDER BY athletics_event, gender, round, place ASC NULLS LAST
  `, { eventName, year });
}

// ---------------------------------------------------------------------
// Competitions browser -- lists RAW event_name values (not grouped by
// display_series_name), so a real naming/classification mistake (a
// wrongly-tiered or misnamed competition) shows up as its own row
// instead of being hidden inside a bigger merged group. Doubles as a
// way to spot cases display_series_name should merge but doesn't yet
// (its own value is shown right next to the raw name).
// ---------------------------------------------------------------------

export type CompetitionListRow = {
  event_name: string;
  display_series_name: string | null;
  tiers: string[];
  min_year: number;
  max_year: number;
  n_editions: number;
};

export async function getCompetitionsList(filters: {
  gender?: string;
  tier?: string;
  year?: number;
  disciplines?: string[];
  search?: string;
} = {}): Promise<CompetitionListRow[]> {
  const { gender, tier, year, disciplines, search } = filters;
  return runQuery<CompetitionListRow>(`
    SELECT event_name,
      ANY_VALUE(display_series_name) AS display_series_name,
      ARRAY_AGG(DISTINCT division_key_resolved IGNORE NULLS) AS tiers,
      MIN(year) AS min_year, MAX(year) AS max_year,
      COUNT(DISTINCT year) AS n_editions
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE event_name IS NOT NULL
      ${gender ? "AND gender = @gender" : ""}
      ${tier ? "AND division_key_resolved = @tier" : ""}
      ${year ? "AND year = @year" : ""}
      ${disciplines?.length ? "AND athletics_event IN UNNEST(@disciplines)" : ""}
      ${search ? "AND (LOWER(event_name) LIKE LOWER(CONCAT('%', @search, '%')) OR LOWER(display_series_name) LIKE LOWER(CONCAT('%', @search, '%')))" : ""}
    GROUP BY event_name
    ORDER BY event_name ASC
    LIMIT 300
  `, {
    ...(gender ? { gender } : {}),
    ...(tier ? { tier } : {}),
    ...(year ? { year } : {}),
    ...(disciplines?.length ? { disciplines } : {}),
    ...(search ? { search } : {}),
  });
}

// Strict literal event_name match (unlike getMeetResults, which matches
// every raw name sharing the same display_series_name) -- shows exactly
// what one specific raw name's rows contain, which is the point of the
// competitions browser: spotting a wrongly-named or wrongly-tiered raw
// competition means looking at ONLY its own rows, not a merged group.
export async function getCompetitionResults(eventName: string, year: number): Promise<MeetResultRow[]> {
  return runQuery<MeetResultRow>(`
    SELECT event_name, COALESCE(display_series_name, event_name) AS series_name,
      athletics_event, gender, round, place, athlete_id,
      athlete_display_name AS display_name, mark_display,
      IF(athletics_discipline IN ('Jumps','Throws'), SAFE_CAST(mark AS FLOAT64), mark_seconds) AS mark_value,
      nationality,
      NULLIF(record, '') AS record, city, country, CAST(date AS STRING) AS date, wind, wind_legal,
      division_key_resolved
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE event_name = @eventName AND year = @year
      AND (round IS NULL OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%' AND LOWER(round) NOT LIKE '%quarterfinal%'))
      AND LOWER(IFNULL(round,'')) NOT LIKE '%combined%'
      AND athlete_display_name IS NOT NULL
    ORDER BY athletics_event, gender, round, place ASC NULLS LAST
  `, { eventName, year });
}

export async function getCompetitionYears(eventName: string): Promise<number[]> {
  const rows = await runQuery<{ year: number }>(`
    SELECT DISTINCT year
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE event_name = @eventName AND year IS NOT NULL
    ORDER BY year DESC
  `, { eventName });
  return rows.map((r) => r.year);
}

// ---------------------------------------------------------------------
// Year-by-year progression of the best mark, for the evolution chart on
// the discipline page (one point per year: that year's single best mark).
// ---------------------------------------------------------------------

export type YearProgressionPoint = { year: number; mark_display: string; mark_value: number };

export async function getEventYearlyProgression(
  event: string,
  gender: string,
  ageCategory?: string
): Promise<YearProgressionPoint[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? "SAFE_CAST(mark AS FLOAT64) DESC" : "mark_seconds ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;

  return runQuery<YearProgressionPoint>(`
    SELECT year, mark_display,
      ${isField ? "SAFE_CAST(mark AS FLOAT64)" : "mark_seconds"} AS mark_value
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athletics_event = @event AND gender = @gender AND year IS NOT NULL
      AND athlete_display_name IS NOT NULL
      AND ${isField ? "SAFE_CAST(mark AS FLOAT64) IS NOT NULL" : "mark_seconds IS NOT NULL"}
      ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
      ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY year ORDER BY ${orderExpr}) = 1
    ORDER BY year ASC
  `, { event, gender });
}
