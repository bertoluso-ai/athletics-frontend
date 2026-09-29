import { runQuery } from "./bigquery";
import { MEET_SERIES_MATCH_SQL } from "./queries";
import { isRelayEvent } from "./events";

// Context for one event (discipline + gender) of a meet series, for the
// right-hand column of the meet page: past winners, most successful
// athletes and countries, the meet record, all-time top performances set at
// this meet, and world records set here.
//
// Marks are compared as a single number where lower is better (field marks
// negated), wind-legal only, and indoor never mixes with outdoor: each mark
// is ranked against marks of the same kind.

const T = "`athletics-database.athletics_all.events_enriched`";

const V = `IF(athletics_discipline IN ('Jumps', 'Throws', 'Combined Events'), -SAFE_CAST(mark AS FLOAT64), mark_seconds)`;
const INDOOR = `(IFNULL(track_key, '') = 'Short Track' OR LOWER(event_name) LIKE '%indoor%')`;
const FINAL = `(round IS NULL OR round = '' OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semi%' AND LOWER(round) NOT LIKE '%quarter%'))`;

export type MeetWinner = {
  year: number;
  athlete_id: string | null;
  display_name: string | null;
  nationality: string | null;
  mark_display: string;
};
export type MeetCount = { key: string; name: string | null; nationality: string | null; wins: number };
export type MeetMark = {
  year: number;
  athlete_id: string | null;
  display_name: string | null;
  nationality: string | null;
  mark_display: string;
  all_time_rank: number | null; // world all-time performance rank (same indoor/outdoor kind)
};

export async function getMeetEventStats(eventName: string, event: string, gender: string) {
  const relay = isRelayEvent(event);
  const params = { eventName, event, gender };
  // Only the columns the three queries below actually read (plus whatever
  // V/INDOOR/FINAL need to compute their derived fields) -- events_enriched
  // has 49 columns; a bare SELECT * here scanned every one of them on every
  // meet-page load, the single heaviest query against the 3GB table.
  const meet = `
    meet AS (
      SELECT event_row_key, year, date, place, round, record, athlete_id, athlete_display_name,
        nationality, mark_display, wind_legal, athletics_discipline, mark, mark_seconds, track_key, event_name,
        ${V} AS v, ${INDOOR} AS indoor
      FROM ${T}
      WHERE ${MEET_SERIES_MATCH_SQL} AND athletics_event = @event AND gender = @gender
    )`;

  const [winners, records, wrs] = await Promise.all([
    // one winner per edition (finals only) -- picked by the mark itself,
    // not competition_score: that's a flat per-tier points value (same for
    // every place=1, whichever section), so when a meet's "Final" and a
    // weaker parallel "Final 1"/"Final 2" both show place = 1 it can't
    // tell them apart and has picked the wrong one (confirmed: Wanda
    // Diamond League Xiamen 2025 Men's 100m listed "Final 1"'s Tao Zhang,
    // 10.55, as the year's winner instead of the real final's Akani
    // Simbine, 9.99). The mark's own value has no such tie, and wind-legal
    // marks are preferred when both exist.
    runQuery<MeetWinner>(
      `
      WITH ${meet}
      SELECT year, w.athlete_id, w.athlete_display_name AS display_name, w.nationality, w.mark_display
      FROM (
        SELECT year,
          ARRAY_AGG(STRUCT(athlete_id, athlete_display_name, nationality, mark_display)
            ORDER BY IFNULL(wind_legal, TRUE) DESC, v, date LIMIT 1)[OFFSET(0)] AS w
        FROM meet
        WHERE place = 1 AND ${FINAL} AND v IS NOT NULL AND v != 0
        GROUP BY year
      )
      ORDER BY year DESC
    `,
      params
    ),
    // best marks at the meet + their world all-time performance rank
    runQuery<MeetMark>(
      `
      WITH ${meet},
      world AS (
        SELECT event_row_key, RANK() OVER (PARTITION BY indoor ORDER BY v) AS all_time_rank
        FROM (
          SELECT event_row_key, ${V} AS v, ${INDOOR} AS indoor
          FROM ${T}
          WHERE athletics_event = @event AND gender = @gender AND IFNULL(wind_legal, TRUE)
        )
        WHERE v IS NOT NULL AND v != 0
      )
      SELECT m.year, m.athlete_id, m.athlete_display_name AS display_name, m.nationality, m.mark_display, w.all_time_rank
      FROM meet m
      LEFT JOIN world w USING (event_row_key)
      WHERE m.v IS NOT NULL AND m.v != 0 AND IFNULL(m.wind_legal, TRUE)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY ${relay ? "m.nationality, m.year" : "IFNULL(m.athlete_id, m.athlete_display_name)"} ORDER BY m.v) = 1
      ORDER BY m.v
      LIMIT 10
    `,
      params
    ),
    // world records set at this meet: better than (or equal to) every
    // earlier legal mark we know of, including the hand-kept reference of
    // records set outside our sources. Only from 1983 on: before that our
    // coverage is too thin to call a mark a world record.
    runQuery<MeetMark>(
      `
      WITH ${meet},
      world AS (
        -- undated rows (old sports123 championships) are placed mid-year
        SELECT event_row_key, COALESCE(date, DATE(year, 7, 1)) AS date, ${V} AS v, ${INDOOR} AS indoor
        FROM ${T}
        WHERE athletics_event = @event AND gender = @gender AND IFNULL(wind_legal, TRUE) AND year IS NOT NULL
        UNION ALL
        SELECT CAST(NULL AS STRING), record_date,
          IF(mark_seconds IS NULL, -SAFE_CAST(mark_display AS FLOAT64), mark_seconds), FALSE
        FROM \`athletics-database.tablasauxiliares.world_records_reference\`
        WHERE athletics_event = @event AND gender = @gender
      ),
      progression AS (
        SELECT event_row_key, date, v,
          MIN(v) OVER (PARTITION BY indoor ORDER BY UNIX_DATE(date) RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS best_before
        FROM world
        WHERE v IS NOT NULL AND v != 0
      )
      SELECT m.year, m.athlete_id, m.athlete_display_name AS display_name, m.nationality, m.mark_display, CAST(NULL AS INT64) AS all_time_rank
      FROM meet m
      LEFT JOIN progression p USING (event_row_key)
      WHERE m.year >= 1983 AND IFNULL(m.wind_legal, TRUE)
        -- the source's own WR flag always counts (e.g. Lewis 9.92, Seoul 1988)
        AND (p.v <= p.best_before OR m.record = 'WR')
      QUALIFY ROW_NUMBER() OVER (PARTITION BY m.year, m.mark_display ORDER BY m.date) = 1
      ORDER BY m.year DESC
    `,
      params
    ),
  ]);

  // most wins, by athlete (teams: by country for relays) and by country
  const byAthlete = new Map<string, MeetCount>();
  const byCountry = new Map<string, MeetCount>();
  for (const w of winners) {
    const ak = relay ? w.nationality ?? "?" : w.athlete_id ?? w.display_name ?? "?";
    const a = byAthlete.get(ak) ?? { key: ak, name: relay ? w.nationality : w.display_name, nationality: w.nationality, wins: 0 };
    a.wins++;
    byAthlete.set(ak, a);
    if (w.nationality) {
      const c = byCountry.get(w.nationality) ?? { key: w.nationality, name: w.nationality, nationality: w.nationality, wins: 0 };
      c.wins++;
      byCountry.set(w.nationality, c);
    }
  }
  const topAthletes = [...byAthlete.values()].filter((a) => a.wins > 1).sort((a, b) => b.wins - a.wins).slice(0, 5);
  const topCountries = [...byCountry.values()].sort((a, b) => b.wins - a.wins).slice(0, 5);
  const allTimeHere = records.filter((r) => r.all_time_rank !== null && r.all_time_rank <= 100);

  return { relay, winners, topAthletes, topCountries, meetRecord: records[0] ?? null, records, allTimeHere, wrs };
}
