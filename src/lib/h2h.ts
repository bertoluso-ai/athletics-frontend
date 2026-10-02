import { pgQuery } from "./pg";

// Head-to-head between two athletes (after ProCyclingStats' H2H): who
// finished ahead when they raced each other, career KPIs side by side,
// points by age, and the list of races they shared.

const T = "events";

// A "shared race" is the same heat/final: same meet, date, discipline,
// gender and round. Relays are left out (a team result, not a duel).
const SHARED = `
  shared AS (
    SELECT a.event_name, a.date, a.year, a.athletics_event, a.round,
      a.place AS place_a, b.place AS place_b, a.mark_display AS mark_a, b.mark_display AS mark_b,
      a.division_key_resolved AS tier
    FROM ${T} a
    JOIN ${T} b
      ON a.event_name = b.event_name AND a.date = b.date AND a.athletics_event = b.athletics_event
     AND a.gender = b.gender AND COALESCE(a.round, '') = COALESCE(b.round, '')
    WHERE a.athlete_id = $1 AND b.athlete_id = $2
      AND a.place IS NOT NULL AND b.place IS NOT NULL
      AND a.athletics_discipline != 'Relays'
  )`;

export type H2HSharedRace = {
  event_name: string;
  date: string;
  year: number;
  athletics_event: string;
  round: string | null;
  place_a: number;
  place_b: number;
  mark_a: string;
  mark_b: string;
  tier: string | null;
};

export type H2HKpis = {
  athlete_id: string;
  nationality: string | null;
  birth_year: number | null;
  first_year: number;
  last_year: number;
  seasons: number;
  results: number;
  wins: number;
  podiums: number;
  points: number;
  best_season_points: number;
  ow_medals: number;
  events: number;
};

export type H2HSeasonPoint = { athlete_id: string; year: number; age: number | null; points: number };

export async function getH2H(a: string, b: string) {
  const [shared, kpis, seasons] = await Promise.all([
    pgQuery<H2HSharedRace>(
      `WITH ${SHARED}
       SELECT event_name, date::text AS date, year, athletics_event, round,
         place_a, place_b, mark_a, mark_b, tier
       FROM shared ORDER BY date DESC`,
      [a, b]
    ),
    pgQuery<H2HKpis>(
      `
      WITH per_year AS (
        SELECT athlete_id, year, SUM(competition_score) AS pts
        FROM ${T} WHERE athlete_id IN ($1, $2) AND competition_score IS NOT NULL
        GROUP BY 1, 2
      ),
      ow AS (
        SELECT athlete_id, COUNT(DISTINCT CONCAT(year, athletics_event, place)) AS n
        FROM ${T}
        WHERE athlete_id IN ($1, $2) AND division_key_resolved = 'OW' AND place BETWEEN 1 AND 3
          AND event_name !~* 'ultimate'
          AND (round IS NULL OR round = '' OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semi%' AND LOWER(round) NOT LIKE '%quarter%'))
        GROUP BY 1
      )
      SELECT e.athlete_id,
        (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
        (ARRAY_AGG(birth_year) FILTER (WHERE birth_year IS NOT NULL))[1] AS birth_year,
        MIN(year) AS first_year, MAX(year) AS last_year,
        COUNT(DISTINCT year) AS seasons,
        COUNT(*) AS results,
        -- wins and podiums in finals / single-round races only
        COUNT(*) FILTER (WHERE place = 1 AND competition_score IS NOT NULL) AS wins,
        COUNT(*) FILTER (WHERE place BETWEEN 1 AND 3 AND competition_score IS NOT NULL) AS podiums,
        ROUND(SUM(competition_score)::numeric, 0) AS points,
        ROUND((ARRAY_AGG(bs.best))[1]::numeric, 0) AS best_season_points,
        COALESCE((ARRAY_AGG(ow.n))[1], 0) AS ow_medals,
        COUNT(DISTINCT athletics_event) AS events
      FROM ${T} e
      LEFT JOIN ow USING (athlete_id)
      LEFT JOIN (SELECT athlete_id, MAX(pts) AS best FROM per_year GROUP BY 1) bs USING (athlete_id)
      WHERE e.athlete_id IN ($1, $2)
      GROUP BY e.athlete_id
    `,
      [a, b]
    ),
    pgQuery<H2HSeasonPoint>(
      `
      SELECT athlete_id, year,
        year - (ARRAY_AGG(birth_year) FILTER (WHERE birth_year IS NOT NULL))[1] AS age,
        ROUND(SUM(competition_score)::numeric, 0) AS points
      FROM ${T}
      WHERE athlete_id IN ($1, $2) AND competition_score IS NOT NULL
      GROUP BY athlete_id, year
      ORDER BY year
    `,
      [a, b]
    ),
  ]);
  return { shared, kpis, seasons };
}

export type H2HSuggestion = {
  athlete_id: string;
  display_name: string;
  nationality: string | null;
  n_shared: number;
  ahead: number; // races where the base athlete finished ahead
};

// Rivals: athletes who shared the most races with this one.
export async function getH2HSuggestions(a: string, limit = 20): Promise<H2HSuggestion[]> {
  return pgQuery<H2HSuggestion>(
    `
    WITH mine AS (
      SELECT event_name, date, athletics_event, gender, COALESCE(round, '') AS rnd, place
      FROM ${T}
      WHERE athlete_id = $1 AND place IS NOT NULL AND athletics_discipline != 'Relays'
    )
    SELECT o.athlete_id,
      (ARRAY_AGG(o.athlete_display_name))[1] AS display_name,
      (ARRAY_AGG(o.nationality ORDER BY o.date DESC) FILTER (WHERE o.nationality IS NOT NULL))[1] AS nationality,
      COUNT(*) AS n_shared,
      COUNT(*) FILTER (WHERE m.place < o.place) AS ahead
    FROM mine m
    JOIN ${T} o
      ON o.event_name = m.event_name AND o.date = m.date AND o.athletics_event = m.athletics_event
     AND o.gender = m.gender AND COALESCE(o.round, '') = m.rnd
    WHERE o.athlete_id IS NOT NULL AND o.athlete_id != $1 AND o.place IS NOT NULL
    GROUP BY o.athlete_id
    ORDER BY n_shared DESC
    LIMIT ${limit}
  `,
    [a]
  );
}
