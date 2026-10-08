import { unstable_cache } from "next/cache";
import { pgQuery } from "./pg";
import { getMeetSeriesKey } from "./queries";
import { isRelayEvent } from "./events";

// Context for one event (discipline + gender) of a meet series, for the
// right-hand column of the meet page: past winners, most successful
// athletes and countries, the meet record, all-time top performances set at
// this meet, and world records set here.
//
// Marks are compared as a single number where lower is better (field marks
// negated), wind-legal only, and indoor never mixes with outdoor: each mark
// is ranked against marks of the same kind.

const T = "events";

const safeCast = (col: string) => `CASE WHEN ${col} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${col}::double precision ELSE NULL END`;
// Hour races are scored by distance (mark = metres, mark_seconds NULL): same
// 'higher is better' handling as jumps/throws, or they get no value at all
// and the meet history panel comes out empty.
const V = `CASE WHEN athletics_discipline IN ('Jumps', 'Throws', 'Combined Events') OR LOWER(athletics_event) LIKE '%hour%' THEN -(${safeCast("mark")}) ELSE mark_seconds END`;
const INDOOR = `(COALESCE(track_key, '') = 'Short Track' OR LOWER(event_name) LIKE '%indoor%')`;
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

async function _getMeetEventStats(eventName: string, event: string, gender: string) {
  const relay = isRelayEvent(event);
  const seriesKey = await getMeetSeriesKey(eventName);
  // $1 = series_key (or the raw event_name itself if it has no series --
  // meet_series_key then simply has no row matching it, so fall back to
  // matching event_name directly), $2 = event, $3 = gender.
  const params = [seriesKey ?? eventName, event, gender];
  const meetSeriesFilter = seriesKey
    ? `event_name IN (SELECT event_name FROM meet_series_key WHERE series_key = $1)`
    : `event_name = $1`;
  // Only the columns the three queries below actually read (plus whatever
  // V/INDOOR/FINAL need to compute their derived fields) -- events has 27
  // columns; a bare SELECT * here would scan every one of them on every
  // meet-page load.
  const meet = `
    meet AS (
      SELECT event_row_key, year, date, place, round, record, athlete_id, athlete_display_name,
        nationality, mark_display, wind_legal, athletics_discipline, mark, mark_seconds, track_key, event_name,
        ${V} AS v, ${INDOOR} AS indoor
      FROM ${T}
      WHERE ${meetSeriesFilter} AND athletics_event = $2 AND gender = $3
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
    pgQuery<MeetWinner>(
      `
      WITH ${meet}
      SELECT * FROM (
        SELECT DISTINCT ON (year) year, athlete_id, athlete_display_name AS display_name, nationality, mark_display
        FROM meet
        WHERE place = 1 AND ${FINAL} AND v IS NOT NULL AND v != 0
        ORDER BY year, COALESCE(wind_legal, TRUE) DESC, v, date
      ) t
      ORDER BY year DESC
    `,
      params
    ),
    // best marks at the meet + their world all-time performance rank
    pgQuery<MeetMark>(
      `
      WITH ${meet},
      world AS (
        SELECT event_row_key, RANK() OVER (PARTITION BY indoor ORDER BY v) AS all_time_rank
        FROM (
          SELECT event_row_key, ${V} AS v, ${INDOOR} AS indoor
          FROM ${T}
          WHERE athletics_event = $2 AND gender = $3 AND COALESCE(wind_legal, TRUE)
        ) z
        WHERE v IS NOT NULL AND v != 0
      )
      SELECT year, athlete_id, display_name, nationality, mark_display, all_time_rank FROM (
        SELECT m.year, m.athlete_id, m.athlete_display_name AS display_name, m.nationality, m.mark_display,
          w.all_time_rank, m.v,
          ROW_NUMBER() OVER (PARTITION BY ${relay ? "m.nationality, m.year" : "COALESCE(m.athlete_id, m.athlete_display_name)"} ORDER BY m.v) AS rn
        FROM meet m
        LEFT JOIN world w USING (event_row_key)
        WHERE m.v IS NOT NULL AND m.v != 0 AND COALESCE(m.wind_legal, TRUE)
      ) t
      WHERE rn = 1
      ORDER BY v
      LIMIT 10
    `,
      params
    ),
    // world records set at this meet: better than (or equal to) every
    // earlier legal mark we know of, including the hand-kept reference of
    // records set outside our sources. Only from 1983 on: before that our
    // coverage is too thin to call a mark a world record.
    pgQuery<MeetMark>(
      `
      WITH ${meet},
      world AS (
        -- undated rows (old sports123 championships) are placed mid-year
        SELECT event_row_key, COALESCE(date, make_date(year, 7, 1)) AS date, ${V} AS v, ${INDOOR} AS indoor
        FROM ${T}
        WHERE athletics_event = $2 AND gender = $3 AND COALESCE(wind_legal, TRUE) AND year IS NOT NULL
        UNION ALL
        SELECT CAST(NULL AS TEXT), record_date,
          CASE WHEN mark_seconds IS NULL THEN -(${safeCast("mark_display")}) ELSE mark_seconds END, FALSE
        FROM world_records_reference
        WHERE athletics_event = $2 AND gender = $3
      ),
      progression AS (
        SELECT event_row_key, date, v,
          MIN(v) OVER (PARTITION BY indoor ORDER BY date RANGE BETWEEN UNBOUNDED PRECEDING AND INTERVAL '1 day' PRECEDING) AS best_before
        FROM world
        WHERE v IS NOT NULL AND v != 0
      )
      SELECT year, athlete_id, display_name, nationality, mark_display, all_time_rank FROM (
        SELECT m.year, m.athlete_id, m.athlete_display_name AS display_name, m.nationality, m.mark_display,
          CAST(NULL AS INTEGER) AS all_time_rank,
          ROW_NUMBER() OVER (PARTITION BY m.year, m.mark_display ORDER BY m.date) AS rn
        FROM meet m
        LEFT JOIN progression p USING (event_row_key)
        WHERE m.year >= 1983 AND COALESCE(m.wind_legal, TRUE)
          -- the source's own WR flag always counts (e.g. Lewis 9.92, Seoul 1988)
          AND (p.v <= p.best_before OR m.record = 'WR')
      ) t
      WHERE rn = 1
      ORDER BY year DESC
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

// Cached: the "world" CTEs above rank EVERY mark ever in the discipline
// (all-time rank + WR progression), identical for every meet page of that
// event/gender, and used to run uncached on every view -- the dominant
// cost of /meets/[name] (~2s even on a repeat hit).
export const getMeetEventStats = unstable_cache(_getMeetEventStats, ["getMeetEventStats-v1"], { revalidate: 3600 });
