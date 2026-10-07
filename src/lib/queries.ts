import { unstable_cache } from "next/cache";
import { runQuery } from "./bigquery";
import { pgQuery } from "./pg";
import { tierPriority, isFieldEvent, EVENT_GROUPS } from "./events";

// Disciplines/Rankings/Countries pages read searchParams, which makes
// them fully dynamic in Next.js (no Full Route Cache, no ISR -- `export
// const revalidate` on those pages does nothing, confirmed live via
// response headers: Cache-Control: no-store, X-Vercel-Cache: MISS on
// every single request, consistent ~2s page time regardless of query
// speed or repetition). The underlying data changes once a day (the
// scheduled BigQuery->Postgres pipeline), so there's no reason to pay
// the full query cost on every visit -- unstable_cache wraps the
// expensive, page-wide (not athlete-specific) query functions below so
// Next's Data Cache serves repeat requests for the same parameters
// straight from cache instead of hitting Postgres again, while the page
// around it still renders dynamically. One hour, matching the pages'
// original (ineffective) revalidate intent.
const DAY_CACHE = { revalidate: 3600 };

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

// Postgres port of BigQuery's SAFE_CAST(mark AS FLOAT64) against the
// `events` mirror's `mark` column -- Postgres errors on a bad cast where
// BigQuery's SAFE_CAST just returns NULL, so every numeric-field-mark
// comparison needs this regex guard instead of a bare `::double precision`.
const safeMarkEvents = `CASE WHEN mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN mark::double precision ELSE NULL END`;

// ---------------------------------------------------------------------
// Athlete profile
// ---------------------------------------------------------------------

export type AthleteInfo = {
  athlete_id: string;
  display_name: string;
  gender: string | null;
  nationality: string | null;
  birth_year: number | null;
  // full "DD MON YYYY" when the source gives day+month, else null -- tells
  // apart a precisely-known birth date from a year-only one (Born display
  // falls back to 1 Jan of birth_year for the latter, flagged with a *)
  birth_date_full: string | null;
  first_year: number;
  last_year: number;
};

// Reads the Postgres `events` mirror (see athletics-database/serving/) --
// same reasoning as the slug queries above: BigQuery's own per-query floor
// doesn't shrink for a single athlete_id lookup even though it's the
// table's leading clustering column.
export async function getAthleteInfo(athleteId: string): Promise<AthleteInfo | null> {
  const rows = await pgQuery<AthleteInfo & { birth_date_raw?: string | null }>(
    `
    SELECT
      athlete_id,
      (ARRAY_AGG(athlete_display_name))[1] AS display_name,
      (ARRAY_AGG(gender))[1] AS gender,
      (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
      (ARRAY_AGG(birth_year) FILTER (WHERE birth_year IS NOT NULL))[1] AS birth_year,
      (ARRAY_AGG(birth_date ORDER BY LENGTH(birth_date) DESC) FILTER (WHERE birth_date IS NOT NULL))[1] AS birth_date_raw,
      MIN(year) AS first_year,
      MAX(year) AS last_year
    FROM events
    WHERE athlete_id = $1
    GROUP BY athlete_id
  `,
    [athleteId]
  );
  const r = rows[0];
  if (!r) return null;
  return { ...r, birth_date_full: r.birth_date_raw && r.birth_date_raw.length > 4 ? r.birth_date_raw : null };
}

// Name-based SEO slugs for athlete profile URLs. Read from the Postgres
// serving layer (table athlete_slugs, mirrored from BigQuery's
// athletics_all.athlete_slugs -- see matchAthletesIncremental/serving/
// export_to_postgres.py), not BigQuery directly: BigQuery's own per-query
// floor (~1-2s, job dispatch + distributed planning) doesn't shrink no
// matter how small the table or how well it's clustered -- measured this
// same lookup at 2.0s even against the materialized table. Postgres
// returns an indexed point lookup in single-digit milliseconds. Hit on
// almost every page (any athlete link needs a slug), so this was the
// single highest-leverage query to move. Disambiguation (name ->
// +nationality -> +first year -> numeric suffix) happens once, upstream,
// in 17_materialize_athlete_slugs.sql -- this table is just the result.
export async function getAthleteSlug(athleteId: string): Promise<string | null> {
  const rows = await pgQuery<{ slug: string }>(`SELECT slug FROM athlete_slugs WHERE athlete_id = $1`, [athleteId]);
  return rows[0]?.slug ?? null;
}

export async function getAthleteIdBySlug(slug: string): Promise<string | null> {
  const rows = await pgQuery<{ athlete_id: string }>(`SELECT athlete_id FROM athlete_slugs WHERE slug = $1`, [slug]);
  return rows[0]?.athlete_id ?? null;
}

// Batched slug lookup for pages/components that link to several athletes at
// once (rankings, meet results, search...): one query for every id on the
// page instead of one per row. Falls back to the raw id (still resolves,
// just via the redirect in /athletes/[id]) for any id missing a slug.
export async function getAthleteSlugs(athleteIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(athleteIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const rows = await pgQuery<{ athlete_id: string; slug: string }>(
    `SELECT athlete_id, slug FROM athlete_slugs WHERE athlete_id = ANY($1)`,
    [ids]
  );
  return new Map(rows.map((r) => [r.athlete_id, r.slug]));
}

export function athleteHref(athleteId: string, slugs?: Map<string, string>): string {
  return `/athletes/${slugs?.get(athleteId) ?? athleteId}`;
}

export type BestResultRow = {
  athletics_event: string;
  gender: string;
  series_name: string; // grouped series (e.g. "World Championships"), for display
  place: 1 | 2 | 3; // exact medal colour -- never mixed with other colours in one row
  n: number; // how many times they got exactly this medal in this discipline+series
  editions: { year: number; event_name: string }[]; // most recent first, each with its own raw name
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
  return pgQuery<BestResultRow>(
    `
    WITH scored AS (
      SELECT athletics_event, gender, event_name,
        COALESCE(display_series_name, event_name) AS series_name,
        year, place, competition_score
      FROM events
      WHERE athlete_id = $1 AND competition_score IS NOT NULL AND place BETWEEN 1 AND 3
    ),
    per_edition AS (
      -- One row per (discipline, NORMALIZED series, year, place) -- not
      -- grouped by the raw series_name, or the same real edition spelled
      -- two different ways in the source (e.g. "Iaaf World Championships"
      -- vs "...In Athletics" for the very same year) would survive as two
      -- separate rows here, and the outer array_agg(year) below would then
      -- list that year twice. Collapses heats/rounds too. (No STRUCT type
      -- in Postgres -- best_event_name/best_series_name/best_score are
      -- three parallel arrays instead, each picking the row with the
      -- highest competition_score via the same ORDER BY.)
      SELECT athletics_event, gender,
        ${normalizeSeriesPg("series_name")} AS series_key,
        year, place,
        (ARRAY_AGG(event_name ORDER BY competition_score DESC))[1] AS best_event_name,
        (ARRAY_AGG(series_name ORDER BY competition_score DESC))[1] AS best_series_name,
        MAX(competition_score) AS best_score
      FROM scored
      GROUP BY athletics_event, gender, series_key, year, place
    ),
    grouped AS (
      SELECT athletics_event, gender, series_key, place, COUNT(*) AS n,
        SUM(best_score) AS total_points,
        -- each year's own raw edition name, so every year links to its edition
        json_agg(json_build_object('year', year, 'event_name', best_event_name) ORDER BY year DESC) AS editions,
        -- Display name keeps its real casing, with org-branding
        -- ("Iaaf "/"World Athletics ") and the trailing ", <city>"
        -- stripped, from whichever edition scored highest.
        (ARRAY_AGG(${displaySeriesPg("best_series_name")} ORDER BY best_score DESC))[1] AS display_series_name
      FROM per_edition
      GROUP BY athletics_event, gender, series_key, place
    )
    SELECT athletics_event, gender, display_series_name AS series_name, place, n, editions
    FROM grouped
    ORDER BY total_points DESC
    LIMIT ${limit}
  `,
    [athleteId]
  );
}

export type AthleteEventOption = { athletics_event: string; n_results: number; years: number[] };

// Disciplines this athlete has actually competed in, most-competed first,
// each with the list of years that actually have data for it -- lets the
// UI only ever offer discipline+year combos that have results.
export async function getAthleteEvents(athleteId: string): Promise<AthleteEventOption[]> {
  return pgQuery<AthleteEventOption>(
    `
    SELECT athletics_event, COUNT(*) AS n_results,
      ARRAY_AGG(DISTINCT year ORDER BY year DESC) AS years
    FROM events
    WHERE athlete_id = $1 AND athletics_event IS NOT NULL AND year IS NOT NULL
    GROUP BY athletics_event
    ORDER BY n_results DESC, athletics_event ASC
  `,
    [athleteId]
  );
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
  // SAFE_CAST(mark AS FLOAT64) -> a regex-guarded cast (Postgres errors on
  // an invalid ::double precision cast instead of returning NULL like
  // BigQuery's SAFE_CAST does). IF(...) -> CASE WHEN.
  const safeMark = `CASE WHEN mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN mark::double precision ELSE NULL END`;

  // The common case (outdoor, wind-legal-only -- the page's default) joins
  // against athlete_discipline_rank, precomputed once a day for exactly
  // this filter combination (see matchAthletesIncremental/registry/
  // 22_materialize_athlete_discipline_rank.sql) -- NOT the live RANK()
  // OVER (...) this used to run on every page load, which meant
  // aggregating every athlete's best mark across every discipline THIS
  // athlete competes in just to place their own rank. Measured live: 3.7s
  // for a 16-discipline athlete, dominated by a disk-spilling sort over
  // 1M+ rows. The rare indoor/illegal-wind views fall back to computing
  // it live, since those aren't worth a second precomputed table.
  if (!includeIllegalWind && !indoor) {
    return pgQuery<PersonalBestRow>(
      `
      WITH my_pbs AS (
        SELECT athletics_event_base, gender, mark_display, event_name, year, wind, wind_legal, mark_seconds AS sort_val,
          ROW_NUMBER() OVER (PARTITION BY athletics_event_base ORDER BY mark_seconds ASC) AS rk
        FROM events
        WHERE athlete_id = $1 AND mark_seconds IS NOT NULL ${windFilter} ${indoorFilter}
        UNION ALL
        SELECT athletics_event_base, gender, mark_display, event_name, year, wind, wind_legal, ${safeMark} AS sort_val,
          ROW_NUMBER() OVER (PARTITION BY athletics_event_base ORDER BY ${safeMark} DESC) AS rk
        FROM events
        WHERE athlete_id = $1 AND mark_seconds IS NULL AND ${safeMark} IS NOT NULL ${windFilter} ${indoorFilter}
      )
      SELECT p.athletics_event_base AS athletics_event, p.gender, p.mark_display, p.event_name, p.year,
        p.wind, p.wind_legal, r.rnk AS all_time_rank
      FROM my_pbs p
      LEFT JOIN athlete_discipline_rank r
        ON r.athletics_event_base = p.athletics_event_base AND r.gender = p.gender AND r.athlete_id = $1
      WHERE p.rk = 1
      ORDER BY r.rnk ASC NULLS LAST
    `,
      [athleteId]
    );
  }

  return pgQuery<PersonalBestRow>(
    `
    WITH my_pbs AS (
      SELECT athletics_event_base, gender, mark_display, event_name, year, wind, wind_legal, mark_seconds AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event_base ORDER BY mark_seconds ASC) AS rk
      FROM events
      WHERE athlete_id = $1 AND mark_seconds IS NOT NULL ${windFilter} ${indoorFilter}
      UNION ALL
      SELECT athletics_event_base, gender, mark_display, event_name, year, wind, wind_legal, ${safeMark} AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athletics_event_base ORDER BY ${safeMark} DESC) AS rk
      FROM events
      WHERE athlete_id = $1 AND mark_seconds IS NULL AND ${safeMark} IS NOT NULL ${windFilter} ${indoorFilter}
    ),
    my_disciplines AS (
      SELECT DISTINCT athletics_event_base, gender FROM my_pbs WHERE rk = 1
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
      SELECT e.athletics_event_base, e.gender, e.athlete_id,
        MIN(CASE WHEN e.mark_seconds IS NOT NULL THEN e.mark_seconds END) AS best_track,
        MAX(CASE WHEN e.mark_seconds IS NULL THEN (CASE WHEN e.mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN e.mark::double precision ELSE NULL END) END) AS best_field
      FROM events e
      JOIN my_disciplines d ON d.athletics_event_base = e.athletics_event_base AND d.gender = e.gender
      WHERE e.athlete_id IS NOT NULL
        AND (e.mark_seconds IS NOT NULL OR (CASE WHEN e.mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN e.mark::double precision ELSE NULL END) IS NOT NULL)
        ${windFilter} ${indoorFilter}
      GROUP BY e.athletics_event_base, e.gender, e.athlete_id
    ),
    ranked AS (
      SELECT athletics_event_base, gender, athlete_id,
        RANK() OVER (
          PARTITION BY athletics_event_base, gender
          ORDER BY (CASE WHEN best_track IS NOT NULL THEN best_track ELSE -best_field END) ASC
        ) AS rnk
      FROM global_best
    )
    SELECT p.athletics_event_base AS athletics_event, p.gender, p.mark_display, p.event_name, p.year,
      p.wind, p.wind_legal, r.rnk AS all_time_rank
    FROM my_pbs p
    LEFT JOIN ranked r
      ON r.athletics_event_base = p.athletics_event_base AND r.gender = p.gender AND r.athlete_id = $1
    WHERE p.rk = 1
    ORDER BY r.rnk ASC NULLS LAST
  `,
    [athleteId]
  );
}

export type YearPointsRow = { year: number; points: number; n_results: number; wins: number; rank: number | null };

// Total points per year (summed across every discipline), each annotated
// with the athlete's rank that year among all athletes of the same gender
// by total annual points -- an overall "how good was this athlete's year"
// ranking, not a per-discipline one.
// Joins the precomputed athlete_year_rank (see
// matchAthletesIncremental/registry/23_materialize_athlete_year_rank.sql)
// instead of the live SUM+RANK() OVER (...) this used to run on every
// athlete-page load -- measured live, that recomputed EVERY athlete's
// total points for EACH year the page's athlete competed in, just to
// place their own rank: 8.6s for a 20-year athlete, the single worst
// query on the athlete page.
export async function getAthleteYearlyPoints(athleteId: string, gender: string): Promise<YearPointsRow[]> {
  return pgQuery<YearPointsRow>(
    `
    WITH my_totals AS (
      SELECT year, ROUND(SUM(competition_score)::numeric, 0) AS points, COUNT(*) AS n_results,
        COUNT(*) FILTER (WHERE place = 1) AS wins
      FROM events
      WHERE athlete_id = $1 AND competition_score IS NOT NULL
      GROUP BY year
    )
    SELECT t.year, t.points, t.n_results, t.wins, r.rnk AS rank
    FROM my_totals t
    LEFT JOIN athlete_year_rank r ON r.year = t.year AND r.athlete_id = $1 AND r.gender = $2
    ORDER BY t.year DESC
  `,
    [athleteId, gender]
  );
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
  race_level: number | null; // field strength of this specific race, 0-100, tier-anchored (see registry/16_compute_race_level.sql) -- "Quality", not to be confused with competition_score ("Points": this athlete's own scored points for this result)
  record: string | null;
  mark_value: number | null;
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
  const params: unknown[] = [athleteId];
  let i = 1;
  const eventFilter = event !== "all" ? `AND e.athletics_event = $${++i}` : "";
  if (event !== "all") params.push(event);
  const yearFilter = year !== "all" ? `AND e.year = $${++i}` : "";
  if (year !== "all") params.push(year);
  const safeMark = `CASE WHEN e.mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN e.mark::double precision ELSE NULL END`;
  return pgQuery<AthleteYearResultRow>(
    `
    SELECT e.date::text AS date, e.year, e.event_name, e.athletics_event, e.round, e.place, e.mark_display,
      e.division_key_resolved AS competition_level, ROUND(e.competition_score::numeric, 0) AS competition_score, rl.race_level,
      NULLIF(e.record, '') AS record, e.wind, e.wind_legal,
      -- Per-row, not per the query's event filter -- "all" mixes track and
      -- field rows in the same result set, and mark_seconds is NULL for
      -- field events regardless of what single discipline (if any) this
      -- call is scoped to. Same track-signal-first rule as
      -- getAthletePersonalBests' global_best CTE: mark_seconds when
      -- present (track), else the field-style numeric mark.
      COALESCE(e.mark_seconds, ${safeMark}) AS mark_value
    FROM events e
    -- Same race_level join as getMeetResults -- keyed by RAW event_name,
    -- round NULL-safe (see its comment there).
    LEFT JOIN race_level rl
      ON rl.event_name = e.event_name AND rl.athletics_event = e.athletics_event
     AND rl.gender = e.gender AND rl.date = e.date
     AND (rl.round = e.round OR (rl.round IS NULL AND e.round IS NULL))
    WHERE e.athlete_id = $1 ${eventFilter} ${yearFilter}
    ORDER BY e.competition_score DESC NULLS LAST, e.date DESC
  `,
    params
  );
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
  level: number | null;
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
  athletes: { athlete_id: string | null; display_name: string; slug: string | null }[];
};

export type Race = {
  key: string;
  event_name: string;
  athletics_event: string;
  gender: string;
  round: string | null;
  date: string;
  competition_level: string | null;
  level: number | null;
  city: string | null;
  country: string | null;
  top3: PodiumEntry[];
};

export type LatestResultGroup = {
  event_name: string;
  competition_level: string | null;
  level: number | null; // best (highest) race level among the group's races -- used to pick between same-day competitions
  city: string | null;
  country: string | null;
  races: Race[]; // most recent first, capped at 4
  total_races: number; // how many races this competition actually has in the window
};

export async function getLatestRaces(
  maxSlots = 10,
  filters: { event?: string; tier?: string; from?: string; to?: string } = {}
): Promise<LatestResultGroup[]> {
  const { event, tier, from, to } = filters;
  // A short window (7 days) keeps "latest" meaningful, but a quiet week can
  // leave the feed with only 1-2 competitions -- widen the lookback until
  // there are at least 5 distinct competitions (not races: one meet can
  // contribute several disciplines), unless the caller asked for an exact
  // range (from/to) of their own.
  const MIN_COMPETITIONS = 5;
  const windows = from || to ? [null] : [7, 14, 30, 90];
  let result: LatestResultGroup[] = [];
  for (const days of windows) {
    result = await fetchWindow(maxSlots, { event, tier, from: days ? isoDaysAgo(days) : from, to });
    if (result.length >= MIN_COMPETITIONS) break;
  }
  return result;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchWindow(
  maxSlots: number,
  filters: { event?: string; tier?: string; from?: string; to?: string }
): Promise<LatestResultGroup[]> {
  const { event, tier, from, to } = filters;
  // Parametros opcionales construidos dinamicamente: Postgres infiere el
  // numero de parametros del placeholder $N mas alto REALMENTE referenciado
  // en el SQL, asi que un filtro que no aplica no puede dejar un $N "hueco"
  // en el texto (mismo patron que getNationRanking en countries.ts).
  const params: unknown[] = [];
  let idx = 1;
  let fromPh = "";
  let toPh = "";
  let eventPh = "";
  let tierPh = "";
  if (from) { params.push(from); fromPh = `$${idx++}`; }
  if (to) { params.push(to); toPh = `$${idx++}`; }
  if (event) { params.push(event); eventPh = `$${idx++}`; }
  if (tier) { params.push(tier); tierPh = `$${idx++}`; }
  const safeMark = `CASE WHEN mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN mark::double precision ELSE NULL END`;

  // The source "place" field is heat-relative, not race-relative -- meets
  // that run many parallel non-eliminating heats (all labelled some variant
  // of "Final") each produce their own place 1/2/3, which would otherwise
  // flood a single race with dozens of "podium" rows. For individual events
  // we ignore the source place entirely and rank by the actual mark
  // ourselves, capped to the real top 3. Relays keep the source place (it
  // already identifies one row per team leg correctly).
  //
  // The source place is also frequently MISSING for the non-winners (some
  // meets/road races only record who won) -- confirmed on the Croatian U18
  // 5km race walk, which stores place=1 for the winner and NULL for 2nd and
  // 3rd, so requiring `place IS NOT NULL` silently dropped two of the three
  // finishers. Rows with no place simply get their rank from their mark;
  // DNF rows are still excluded by the mark filter below (nothing to rank
  // on). Relays with a NULL place fall out naturally (their real_place is
  // the NULL source place, so the 1-3 filter drops them).
  const rows = await pgQuery<ResultRow>(`
    WITH candidates AS (
      SELECT
        event_name, athletics_event, athletics_discipline, gender, round,
        date::text AS date,
        division_key_resolved AS competition_level,
        ROUND(competition_score::numeric) AS level,
        place, athlete_id, athlete_display_name AS display_name, mark_display,
        nationality, NULLIF(record, '') AS record, city, country, wind, wind_legal,
        mark_seconds, ${safeMark} AS mark_num,
        LOWER(athletics_event) LIKE '%relay%' AS is_relay
      FROM events
      WHERE (round IS NULL OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semifinal%' AND LOWER(round) NOT LIKE '%quarterfinal%'))
        AND LOWER(COALESCE(round,'')) NOT LIKE '%combined%'
        ${from ? `AND date >= ${fromPh}` : "AND date >= CURRENT_DATE - INTERVAL '7 days'"}
        ${to ? `AND date <= ${toPh}` : ""}
        AND athlete_display_name IS NOT NULL
        AND (mark_seconds IS NOT NULL OR ${safeMark} IS NOT NULL)
        ${event ? `AND athletics_event = ${eventPh}` : ""}
        ${tier ? `AND division_key_resolved = ${tierPh}` : ""}
    ),
    ranked AS (
      SELECT *,
        -- Partitioned by round: some meets split a discipline into
        -- parallel sections ("Final 1"/"Final 2", by pace/seed), each with
        -- its own real place 1/2/3 -- without this they'd get ranked
        -- against each other as if it were one race. NOT by wind: a single
        -- real race carries a per-athlete wind reading (each athlete's own
        -- best attempt), so two different winds under one round do NOT
        -- imply two separate races -- confirmed on the Ukrainian U18 triple
        -- jump final, whose places 1-4 read 0.0/0.0/+1.5/0.0 and used to be
        -- split into two "races". Genuine parallel sections are rare, and
        -- ranking their rows together (best 3 overall) is still the right
        -- podium to show.
        CASE WHEN is_relay THEN place ELSE RANK() OVER (
          PARTITION BY event_name, athletics_event, gender, date, round
          -- Field events and combined events score by magnitude/points,
          -- higher is better, and never populate mark_seconds (throws/jumps
          -- store the distance/height in the "mark" column, multi-events store
          -- total points); rank them by -mark_num so they come out high-to-low.
          -- This used to key off a hardcoded list of event names, which
          -- broke the moment a source spelled the discipline with an age/
          -- implement suffix ("Shot Put (5kg)", "Decathlon U20", "Discus
          -- Throw (1.500kg)", ...) -- the name missed the list, fell through
          -- to a NULL mark_seconds, and every participant then tied on the
          -- same NULL sort value so RANK() pinned them all at 1 and the whole
          -- field passed the "top 3" filter below. Keying off the normalised
          -- athletics_discipline covers every spelling; the mark_seconds IS
          -- NULL arm catches any remaining row (e.g. "Unknown" discipline)
          -- that still lacks a time.
          ORDER BY CASE
            WHEN athletics_discipline IN ('Throws','Jumps','Combined Events') OR mark_seconds IS NULL
            THEN -mark_num ELSE mark_seconds END ASC,
            -- Break a dead heat with the source's own place: when two rows
            -- carry the exact same mark the source has already decided which
            -- is ahead (e.g. the Ukrainian U18 women's triple jump had
            -- 11.74 for both 3rd and 4th). Without this, RANK() ties them at
            -- the same real_place and BOTH pass the 1-3 filter, widening the
            -- podium to four entries. NULL place (unplaced finishers) sorts
            -- last, so it never outranks a placed row of the same mark.
            place ASC NULLS LAST
        ) END AS real_place
      FROM candidates
    )
    SELECT event_name, athletics_event, gender, round, date, competition_level, level,
      real_place AS place, athlete_id, display_name, mark_display, nationality, record, city, country, wind, wind_legal
    FROM ranked
    WHERE real_place BETWEEN 1 AND 3
    ORDER BY date DESC
  `, params);

  // Group into races, then within each race group by place -- a relay
  // team has one row per runner sharing the same place/mark/nationality,
  // and those must collapse into a single podium entry with a roster,
  // not one row per runner. Individual events never collapse like this,
  // even when two athletes from the same country tie for the same place.
  const races = new Map<string, Race>();
  const podiumsByRace = new Map<string, Map<string, PodiumEntry>>();

  for (const r of rows) {
    // Keyed WITHOUT wind: one real race can carry a per-athlete wind, so
    // including wind here would split a single final into several races on
    // the feed (matches the RANK partition above).
    const key = `${r.event_name}|${r.athletics_event}|${r.gender}|${r.date}|${r.round ?? ""}`;
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
        level: r.level,
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
    entry.athletes.push({ athlete_id: r.athlete_id, display_name: r.display_name, slug: null });
  }

  const list = Array.from(races.values());
  for (const race of list) race.top3.sort((a, b) => a.place - b.place);
  // Most recent first within a race group.
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // One competition (e.g. a multi-discipline championships) can produce a
  // dozen races on the same day -- group them so the feed shows a handful
  // of its latest results plus a link to the rest, instead of flooding the
  // whole list with one meet.
  const groups = new Map<string, LatestResultGroup>();
  for (const race of list) {
    let g = groups.get(race.event_name);
    if (!g) {
      g = { event_name: race.event_name, competition_level: race.competition_level, level: race.level, city: race.city, country: race.country, races: [], total_races: 0 };
      groups.set(race.event_name, g);
    }
    // keep the group's own tier at its best (lowest-priority-number) race
    if (tierPriority(race.competition_level) < tierPriority(g.competition_level)) g.competition_level = race.competition_level;
    // ...and its own level at its best (highest-scoring) race, used as a
    // tiebreak below when two competitions land on the same date
    if ((race.level ?? -1) > (g.level ?? -1)) g.level = race.level;
    g.total_races++;
    if (g.races.length < 3) g.races.push(race);
  }

  // Recency leads: a more recent competition always shows above an older
  // one, tier breaks ties on the same date (EXCEPT tier F, which sinks to
  // the bottom regardless of how recent, so a handful of parkrun-level
  // results never bury a real -- if slightly older -- competition), and the
  // race level (Lvl 0-100, field strength) breaks any remaining tie within
  // the same tier -- e.g. two Tier A meets on the same day, the one with
  // the stronger actual field shows first.
  const orderedGroups = Array.from(groups.values()).sort((a, b) => {
    const fa = a.competition_level === "F" ? 1 : 0;
    const fb = b.competition_level === "F" ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const da = a.races[0]?.date ?? "";
    const db = b.races[0]?.date ?? "";
    if (da !== db) return da < db ? 1 : -1;
    const tierDiff = tierPriority(a.competition_level) - tierPriority(b.competition_level);
    if (tierDiff !== 0) return tierDiff;
    return (b.level ?? -1) - (a.level ?? -1);
  });

  const result: LatestResultGroup[] = [];
  let slots = 0;
  for (const g of orderedGroups) {
    if (slots > 0 && slots + g.races.length > maxSlots) break;
    result.push(g);
    slots += g.races.length;
    if (slots >= maxSlots) break;
  }

  const ids = result.flatMap((g) => g.races.flatMap((race) => race.top3.flatMap((e) => e.athletes.map((a) => a.athlete_id))));
  const slugs = await getAthleteSlugs(ids.filter((id): id is string => !!id));
  for (const g of result) for (const race of g.races) for (const entry of race.top3) for (const a of entry.athletes) a.slug = slugs.get(a.athlete_id ?? "") ?? null;

  return result;
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
  // the raw event_name of the most recent PAST edition of this same
  // competition, when one can be found by name (~73% of upcoming
  // competitions have one) -- lets the card link to that edition's meet
  // page (the meet page needs a real historical event_name to resolve;
  // the scraped upcoming name itself is rarely one).
  past_event_name: string | null;
};

export async function getUpcomingCompetitions(
  limit = 10,
  category?: string,
  discipline?: string
): Promise<UpcomingCompetition[]> {
  // No category filter ("All categories"): OW-B all weigh the same (not a
  // strict tier hierarchy among themselves) -- a nearer B shows ahead of a
  // later A, exactly like a nearer A shows ahead of a later OW. Only the
  // OW-B bucket as a whole outranks C-F, so a flood of small club meets
  // can't crowd the real ones out of the 10 slots, but a C-F race still
  // gets through when there's room (e.g. a quiet week with nothing bigger
  // nearby). An explicit category filter cares only about date.
  // Stays on BigQuery: joining upcoming_competitions (~10 rows) against
  // events by a regex-normalized series match has no indexable scope --
  // even a 1-year date prefilter still leaves 660k+ candidate rows for the
  // regex join, which took 90s+ on Postgres's single node (fine on
  // BigQuery's distributed engine). Same lesson as calendar.ts.
  const orderBy = category
    ? "date_start ASC"
    : "IF(category IN ('OW','DF','GW','GL','A','B'), 0, 1) ASC, date_start ASC";
  return runQuery<UpcomingCompetition>(`
    WITH up AS (
      SELECT row_key, date_start, date_end, name, venue, country, category, disciplines
      FROM \`athletics-database.tablasauxiliares.upcoming_competitions\`
      WHERE date_start >= CURRENT_DATE()
        ${category ? "AND category = @category" : ""}
        ${discipline ? "AND disciplines LIKE CONCAT('%', @discipline, '%')" : ""}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    ),
    matches AS (
      SELECT up.row_key, e.event_name, e.date,
        ROW_NUMBER() OVER (PARTITION BY up.row_key ORDER BY e.date DESC) AS rn
      FROM up
      JOIN \`athletics-database.athletics_all.events_enriched\` e
        ON ${normalizeSeries("e.event_name")} = ${normalizeSeries("up.name")}
      WHERE e.date IS NOT NULL
    )
    SELECT
      CAST(up.date_start AS STRING) AS date_start,
      CAST(up.date_end AS STRING) AS date_end,
      up.name, up.venue, up.country, up.category, up.disciplines,
      m.event_name AS past_event_name
    FROM up
    LEFT JOIN (SELECT row_key, event_name FROM matches WHERE rn = 1) m USING (row_key)
    ORDER BY up.date_start ASC
  `, { ...(category ? { category } : {}), ...(discipline ? { discipline } : {}) });
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
  slug?: string | null;
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
  const markValueExpr = isField ? safeMarkEvents : "mark_seconds";
  return `
    SELECT
      athlete_id, (ARRAY_AGG(athlete_display_name))[1] AS display_name,
      ROUND(SUM(competition_score)::numeric, 0) AS points,
      COUNT(*) AS n_results,
      (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
      (ARRAY_AGG(birth_year) FILTER (WHERE birth_year IS NOT NULL))[1] AS birth_year,
      (ARRAY_AGG(mark_display ORDER BY ${markOrderExpr}) FILTER (WHERE mark_display IS NOT NULL))[1] AS best_mark,
      (ARRAY_AGG(${markValueExpr} ORDER BY ${markOrderExpr}) FILTER (WHERE ${markValueExpr} IS NOT NULL))[1] AS best_mark_value,
      (ARRAY_AGG(wind ORDER BY ${markOrderExpr}) FILTER (WHERE wind IS NOT NULL))[1] AS best_mark_wind,
      (ARRAY_AGG(wind_legal ORDER BY ${markOrderExpr}))[1] AS best_mark_wind_legal
    FROM events
    WHERE ${year !== "all" ? `year = ${year} AND` : ""} athletics_event = $1 AND gender = $2
      AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
      ${hasNationality ? "AND nationality = $3" : ""}
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
  const markOrderExpr = isField ? `${safeMarkEvents} DESC` : "mark_seconds ASC";
  const outerOrder =
    sortBy === "mark"
      ? `best_mark_value IS NULL, ${isField ? "best_mark_value DESC" : "best_mark_value ASC"}`
      : "points DESC";
  const params: unknown[] = [event, gender];
  if (nationality) params.push(nationality);
  return pgQuery<RankingRow>(`
    WITH agg AS (${rankingAggCte(event, year, ageMax, isField, markOrderExpr, !!nationality, !includeIllegalWind, indoor)})
    SELECT * FROM agg
    ORDER BY ${outerOrder}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, params);
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
  const markOrderExpr = isField ? `${safeMarkEvents} DESC` : "mark_seconds ASC";
  const params: unknown[] = [event, gender];
  if (nationality) params.push(nationality);
  const rows = await pgQuery<{ n: number }>(`
    WITH agg AS (${rankingAggCte(event, year, ageMax, isField, markOrderExpr, !!nationality, !includeIllegalWind, indoor)})
    SELECT COUNT(*) AS n FROM agg
  `, params);
  return rows[0]?.n ?? 0;
}

export type NationalityOption = { code: string; name: string; area: string | null };

async function _getAvailableNationalities(event: string, gender: string, year: number | "all"): Promise<NationalityOption[]> {
  return pgQuery<NationalityOption>(`
    WITH codes AS (
      SELECT DISTINCT nationality AS code
      FROM events
      WHERE ${year !== "all" ? `year = ${year} AND` : ""} athletics_event_base = $1 AND gender = $2 AND nationality IS NOT NULL
    ),
    names AS (
      SELECT code, name, area FROM countries
    )
    SELECT c.code, COALESCE(n.name, c.code) AS name, n.area
    FROM codes c
    LEFT JOIN names n USING (code)
    ORDER BY name
  `, [event, gender]);
}
export const getAvailableNationalities = unstable_cache(_getAvailableNationalities, ["getAvailableNationalities-v2"], DAY_CACHE);

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
  best_mark: string | null;
  best_mark_value: number | null; // kept for the "mark" sort order, not rendered directly
  roster: string[];
};

function relayRankingAggCte(event: string, year: number | "all", hasNationality: boolean) {
  return `
    WITH races AS (
      SELECT event_name, date::text AS date, nationality, mark_display, mark_seconds, competition_score,
        COALESCE(ARRAY_AGG(DISTINCT athlete_display_name ORDER BY athlete_display_name) FILTER (WHERE athlete_display_name IS NOT NULL), ARRAY[]::text[]) AS roster
      FROM events
      WHERE ${year !== "all" ? `year = ${year} AND` : ""} athletics_event = $1 AND gender = $2
        AND nationality IS NOT NULL AND mark_seconds IS NOT NULL
        ${hasNationality ? "AND nationality = $3" : ""}
      GROUP BY event_name, date, nationality, mark_display, mark_seconds, competition_score
    ),
    totals AS (
      SELECT nationality, ROUND(SUM(competition_score)::numeric, 0) AS points
      FROM races
      GROUP BY nationality
    ),
    best AS (
      SELECT nationality, mark_display AS best_mark, mark_seconds AS best_mark_value, roster FROM (
        SELECT nationality, mark_display, mark_seconds, roster,
          ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY mark_seconds ASC) AS rn
        FROM races
      ) z
      WHERE rn = 1
    )
    SELECT t.nationality, t.points, b.best_mark, b.best_mark_value, b.roster
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
  const params: unknown[] = [event, gender];
  if (nationality) params.push(nationality);
  return pgQuery<RelayRankingRow>(`
    WITH agg AS (${relayRankingAggCte(event, year, !!nationality)})
    SELECT * FROM agg
    ORDER BY ${outerOrder}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, params);
}

export async function getRelayYearRankingCount(
  event: string,
  gender: string,
  year: number | "all",
  filters: { nationality?: string } = {}
): Promise<number> {
  const { nationality } = filters;
  const params: unknown[] = [event, gender];
  if (nationality) params.push(nationality);
  const rows = await pgQuery<{ n: number }>(`
    WITH agg AS (${relayRankingAggCte(event, year, !!nationality)})
    SELECT COUNT(*) AS n FROM agg
  `, params);
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
  slug?: string | null;
};

function globalRankingAggCte(year: number | "all", ageMax: number | undefined, hasNationality: boolean) {
  return `
    SELECT
      athlete_id, (ARRAY_AGG(athlete_display_name))[1] AS display_name,
      ROUND(SUM(competition_score)::numeric, 0) AS points,
      COUNT(*) AS n_results,
      (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality,
      (ARRAY_AGG(birth_year) FILTER (WHERE birth_year IS NOT NULL))[1] AS birth_year
    FROM events
    WHERE ${year !== "all" ? `year = ${year} AND` : ""} gender = $1
      AND competition_score IS NOT NULL AND athlete_id IS NOT NULL
      ${hasNationality ? "AND nationality = $2" : ""}
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
  const params: unknown[] = [gender];
  if (nationality) params.push(nationality);
  return pgQuery<GlobalRankingRow>(`
    WITH agg AS (${globalRankingAggCte(year, ageMax, !!nationality)})
    SELECT * FROM agg
    ORDER BY points DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, params);
}

export async function getGlobalYearRankingCount(
  gender: string,
  year: number | "all",
  filters: { nationality?: string; ageCategory?: string } = {}
): Promise<number> {
  const { nationality, ageCategory } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const params: unknown[] = [gender];
  if (nationality) params.push(nationality);
  const rows = await pgQuery<{ n: number }>(`
    WITH agg AS (${globalRankingAggCte(year, ageMax, !!nationality)})
    SELECT COUNT(*) AS n FROM agg
  `, params);
  return rows[0]?.n ?? 0;
}

export async function getGlobalAvailableNationalities(gender: string, year: number | "all"): Promise<NationalityOption[]> {
  return pgQuery<NationalityOption>(`
    WITH codes AS (
      SELECT DISTINCT nationality AS code
      FROM events
      WHERE ${year !== "all" ? `year = ${year} AND` : ""} gender = $1 AND nationality IS NOT NULL
    ),
    names AS (
      SELECT code, name FROM countries
    )
    SELECT c.code, COALESCE(n.name, c.code) AS name
    FROM codes c
    LEFT JOIN names n USING (code)
    ORDER BY name
  `, [gender]);
}

// ---------------------------------------------------------------------
// Best marks of the year, for a single event + gender.
// ---------------------------------------------------------------------

export type MarkRow = {
  athlete_id: string;
  display_name: string;
  mark_display: string;
  nationality: string | null;
  record: string | null;
};

async function _getEventAllTimeBest(
  event: string, gender: string, limit = 10, ageCategory?: string, indoor = false, nationality?: string, area?: string
): Promise<MarkRow[]> {
  // discipline_leaderboard has no age/indoor split (it's the plain
  // outdoor/all-ages best per athlete), so those two filters still need
  // the live per-discipline window-scan below. But nationality/area are
  // just a WHERE on top of an already-small per-discipline row set (one
  // discipline+gender's worth of rows, not the full `events` table) --
  // confirmed live at ~26ms filtered by nationality, same ballpark as the
  // unfiltered fast path (~1-5ms) and nowhere near the live path's
  // ~670ms. Used to fall through to the live query for ANY nationality/
  // area filter, paying that cost for no reason.
  if (!ageCategory && !indoor) {
    const params: unknown[] = [event, gender];
    let idx = 3;
    let natSql = "";
    let areaSql = "";
    if (nationality) { natSql = `AND nationality = $${idx++}`; params.push(nationality); }
    if (area) { areaSql = `AND nationality IN (SELECT code FROM countries WHERE area = $${idx++})`; params.push(area); }
    return pgQuery<MarkRow>(
      `
      SELECT athlete_id, display_name, nationality, mark_display, record
      FROM discipline_leaderboard
      WHERE athletics_event_base = $1 AND gender = $2 ${natSql} ${areaSql}
      ORDER BY rnk ASC
      LIMIT ${limit}
    `,
      params
    );
  }

  const isField = isFieldEvent(event);
  const orderExpr = isField ? `${safeMarkEvents} DESC` : "mark_seconds ASC";
  const outerOrderExpr = isField ? "sort_val DESC" : "sort_val ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const params: unknown[] = [event, gender];
  let idx = 3;
  let nationalityPh = "";
  let areaPh = "";
  if (nationality) { params.push(nationality); nationalityPh = `$${idx++}`; }
  if (area) { params.push(area); areaPh = `$${idx++}`; }

  return pgQuery<MarkRow>(`
    SELECT athlete_id, display_name, mark_display, nationality, record FROM (
      SELECT athlete_id, athlete_display_name AS display_name, mark_display, nationality,
        NULLIF(record, '') AS record, ${isField ? safeMarkEvents : "mark_seconds"} AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athlete_id ORDER BY ${orderExpr}) AS rn
      FROM events
      WHERE athletics_event_base = $1 AND gender = $2
        AND athlete_display_name IS NOT NULL
        AND ${isField ? `${safeMarkEvents} IS NOT NULL` : "mark_seconds IS NOT NULL"}
        ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
        ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
        ${nationality ? `AND nationality = ${nationalityPh}` : ""}
        ${area ? `AND nationality IN (SELECT code FROM countries WHERE area = ${areaPh})` : ""}
        AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
    ) z
    WHERE rn = 1
    ORDER BY ${outerOrderExpr}
    LIMIT ${limit}
  `, params);
}
export const getEventAllTimeBest = unstable_cache(_getEventAllTimeBest, ["getEventAllTimeBest-v2"], DAY_CACHE);

export type AreaBestRow = MarkRow & { area: string; area_name: string };

// Best mark ever, one per World Athletics area (continent) -- same
// tablasauxiliares.countries.area used by the Countries/Rankings area
// filter, so this stays consistent with what "area" means elsewhere.
async function _getEventBestByArea(event: string, gender: string, indoor = false): Promise<AreaBestRow[]> {
  const isField = isFieldEvent(event);
  const safeMarkE = `CASE WHEN e.mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN e.mark::double precision ELSE NULL END`;
  const orderExpr = isField ? `${safeMarkE} DESC` : "e.mark_seconds ASC";
  const outerOrderExpr = isField ? "sort_val DESC" : "sort_val ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);

  return pgQuery<AreaBestRow>(`
    SELECT area, area_name, athlete_id, display_name, mark_display, nationality, record FROM (
      SELECT c.area, c.area_name, e.athlete_id, e.athlete_display_name AS display_name, e.mark_display,
        e.nationality, NULLIF(e.record, '') AS record, ${isField ? safeMarkE : "e.mark_seconds"} AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY c.area ORDER BY ${orderExpr}) AS rn
      FROM events e
      JOIN countries c ON c.code = e.nationality
      WHERE c.area IS NOT NULL AND e.athletics_event_base = $1 AND e.gender = $2
        AND e.athlete_display_name IS NOT NULL
        AND ${isField ? `${safeMarkE} IS NOT NULL` : "e.mark_seconds IS NOT NULL"}
        ${windFiltered ? "AND (e.wind_legal IS NULL OR e.wind_legal = TRUE)" : ""}
        AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
    ) z
    WHERE rn = 1
    ORDER BY ${outerOrderExpr}
  `, [event, gender]);
}
export const getEventBestByArea = unstable_cache(_getEventBestByArea, ["getEventBestByArea-v2"], DAY_CACHE);

// Best mark ever, one per country -- capped, sorted fastest first (a
// compact "national records" leaderboard, not the full country list).
async function _getEventBestByCountry(event: string, gender: string, indoor = false, limit = 15): Promise<MarkRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? `${safeMarkEvents} DESC` : "mark_seconds ASC";
  const outerOrderExpr = isField ? "sort_val DESC" : "sort_val ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);

  return pgQuery<MarkRow>(`
    SELECT athlete_id, display_name, mark_display, nationality, record FROM (
      SELECT athlete_id, athlete_display_name AS display_name, mark_display, nationality,
        NULLIF(record, '') AS record, ${isField ? safeMarkEvents : "mark_seconds"} AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY ${orderExpr}) AS rn
      FROM events
      WHERE athletics_event_base = $1 AND gender = $2 AND nationality IS NOT NULL
        AND athlete_display_name IS NOT NULL
        AND ${isField ? `${safeMarkEvents} IS NOT NULL` : "mark_seconds IS NOT NULL"}
        ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
        AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
    ) z
    WHERE rn = 1
    ORDER BY ${outerOrderExpr}
    LIMIT ${limit}
  `, [event, gender]);
}
export const getEventBestByCountry = unstable_cache(_getEventBestByCountry, ["getEventBestByCountry-v2"], DAY_CACHE);

export type RecordTenureRow = {
  athlete_id: string;
  display_name: string;
  nationality: string | null;
  years_held: number;
  n_spans: number;
};

// How many years each athlete has held the all-time #1 mark, summed
// across every separate stretch they've held it (a record can change
// hands and come back). One row per calendar date's best mark (ties on
// the same day collapse to one), the all-time-best-so-far strictly
// BEFORE each row decides whether that row is a genuine new record;
// tenure runs from that date to whenever the next new record lands, or
// to today for whoever holds it now.
async function _getEventRecordTenure(event: string, gender: string, limit = 12): Promise<RecordTenureRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? "v DESC" : "v ASC";
  const better = isField ? "v > prior_best" : "v < prior_best";
  const bestAgg = isField ? "MAX" : "MIN";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);

  return pgQuery<RecordTenureRow>(`
    WITH marks AS (
      SELECT athlete_id, athlete_display_name AS display_name, nationality, date,
        ${isField ? safeMarkEvents : "mark_seconds"} AS v
      FROM events
      WHERE athletics_event_base = $1 AND gender = $2 AND date IS NOT NULL
        AND athlete_display_name IS NOT NULL
        AND ${isField ? `${safeMarkEvents} IS NOT NULL` : "mark_seconds IS NOT NULL"}
        ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
    ),
    per_day AS (
      SELECT date, athlete_id, display_name, nationality, v FROM (
        SELECT date, athlete_id, display_name, nationality, v,
          ROW_NUMBER() OVER (PARTITION BY date ORDER BY ${orderExpr}) AS rn
        FROM marks
      ) z
      WHERE rn = 1
    ),
    with_prior AS (
      SELECT *, ${bestAgg}(v) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_best
      FROM per_day
    ),
    new_records AS (
      SELECT * FROM with_prior WHERE prior_best IS NULL OR ${better}
    ),
    spans AS (
      SELECT athlete_id, display_name, nationality, date AS start_date,
        COALESCE(LEAD(date) OVER (ORDER BY date), CURRENT_DATE) AS end_date
      FROM new_records
    )
    SELECT athlete_id, (ARRAY_AGG(display_name))[1] AS display_name, (ARRAY_AGG(nationality))[1] AS nationality,
      ROUND((SUM(end_date - start_date) / 365.25)::numeric, 1) AS years_held,
      COUNT(*) AS n_spans
    FROM spans
    GROUP BY athlete_id
    ORDER BY years_held DESC
    LIMIT ${limit}
  `, [event, gender]);
}
export const getEventRecordTenure = unstable_cache(_getEventRecordTenure, ["getEventRecordTenure-v2"], DAY_CACHE);

async function _getEventAvailableYears(event: string, gender: string): Promise<number[]> {
  const rows = await pgQuery<{ year: number }>(`
    SELECT DISTINCT year FROM events
    WHERE athletics_event_base = $1 AND gender = $2 AND year IS NOT NULL
    ORDER BY year DESC
  `, [event, gender]);
  return rows.map((r) => r.year);
}
export const getEventAvailableYears = unstable_cache(_getEventAvailableYears, ["getEventAvailableYears"], DAY_CACHE);

export async function getEventYearBestMarks(
  event: string,
  gender: string,
  year: number,
  limit = 10,
  ageCategory?: string,
  indoor = false,
  nationality?: string,
  area?: string
): Promise<MarkRow[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? `${safeMarkEvents} DESC` : "mark_seconds ASC";
  const outerOrderExpr = isField ? "sort_val DESC" : "sort_val ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const params: unknown[] = [event, gender];
  let idx = 3;
  let nationalityPh = "";
  let areaPh = "";
  if (nationality) { params.push(nationality); nationalityPh = `$${idx++}`; }
  if (area) { params.push(area); areaPh = `$${idx++}`; }

  return pgQuery<MarkRow>(`
    SELECT athlete_id, display_name, mark_display, nationality, record FROM (
      SELECT athlete_id, athlete_display_name AS display_name, mark_display, nationality,
        NULLIF(record, '') AS record, ${isField ? safeMarkEvents : "mark_seconds"} AS sort_val,
        ROW_NUMBER() OVER (PARTITION BY athlete_id ORDER BY ${orderExpr}) AS rn
      FROM events
      WHERE year = ${year} AND athletics_event_base = $1 AND gender = $2
        AND athlete_display_name IS NOT NULL
        AND ${isField ? `${safeMarkEvents} IS NOT NULL` : "mark_seconds IS NOT NULL"}
        ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
        ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
        ${nationality ? `AND nationality = ${nationalityPh}` : ""}
        ${area ? `AND nationality IN (SELECT code FROM countries WHERE area = ${areaPh})` : ""}
        AND ${indoor ? "" : "NOT "}${INDOOR_EXPR}
    ) z
    WHERE rn = 1
    ORDER BY ${outerOrderExpr}
    LIMIT ${limit}
  `, params);
}

// ---------------------------------------------------------------------
// Relay events: one row per team-performance (all legs of a team on a
// given day collapsed into a single roster), best team time per nation.
// ---------------------------------------------------------------------

export type RelayMarkRow = {
  nationality: string | null;
  mark_display: string;
  roster: string[];
  record: string | null;
};

export async function getEventAllTimeBestRelay(event: string, gender: string, limit = 10): Promise<RelayMarkRow[]> {
  return pgQuery<RelayMarkRow>(`
    WITH teams AS (
      SELECT event_name, date, nationality, mark_display, mark_seconds,
        COALESCE(ARRAY_AGG(DISTINCT athlete_display_name ORDER BY athlete_display_name) FILTER (WHERE athlete_display_name IS NOT NULL), ARRAY[]::text[]) AS roster,
        (ARRAY_AGG(NULLIF(record, '')))[1] AS record
      FROM events
      WHERE athletics_event = $1 AND gender = $2
        AND nationality IS NOT NULL AND mark_seconds IS NOT NULL
      -- event_name/date only group the roster into the right race, not
      -- returned -- nothing downstream renders which meet/date a relay
      -- best came from.
      GROUP BY event_name, date, nationality, mark_display, mark_seconds
    )
    SELECT nationality, mark_display, roster, record FROM (
      SELECT nationality, mark_display, mark_seconds, roster, record,
        ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY mark_seconds ASC) AS rn
      FROM teams
    ) z
    WHERE rn = 1
    ORDER BY mark_seconds ASC
    LIMIT ${limit}
  `, [event, gender]);
}

export async function getEventYearBestMarksRelay(
  event: string,
  gender: string,
  year: number,
  limit = 10
): Promise<RelayMarkRow[]> {
  return pgQuery<RelayMarkRow>(`
    WITH teams AS (
      SELECT event_name, date, nationality, mark_display, mark_seconds,
        COALESCE(ARRAY_AGG(DISTINCT athlete_display_name ORDER BY athlete_display_name) FILTER (WHERE athlete_display_name IS NOT NULL), ARRAY[]::text[]) AS roster,
        (ARRAY_AGG(NULLIF(record, '')))[1] AS record
      FROM events
      WHERE year = ${year} AND athletics_event = $1 AND gender = $2
        AND nationality IS NOT NULL AND mark_seconds IS NOT NULL
      GROUP BY event_name, date, nationality, mark_display, mark_seconds
    )
    SELECT nationality, mark_display, roster, record FROM (
      SELECT nationality, mark_display, mark_seconds, roster, record,
        ROW_NUMBER() OVER (PARTITION BY nationality ORDER BY mark_seconds ASC) AS rn
      FROM teams
    ) z
    WHERE rn = 1
    ORDER BY mark_seconds ASC
    LIMIT ${limit}
  `, [event, gender]);
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
// Postgres ports of normalizeSeries/displaySeries below -- same patterns,
// but Postgres's regex flavour (POSIX "Advanced Regular Expressions") uses
// \\m/\\M (start/end of word) instead of PCRE's \\b (which means backspace
// here, not a word boundary -- a real gotcha), is embedded ()-flags
// aside, requires the 'g' flag explicitly as REGEXP_REPLACE's 4th arg (it
// defaults to replacing only the FIRST match, unlike BigQuery's always-
// global behaviour), and REGEXP_REPLACE's capture-group backreference in
// the replacement is \\1 same as BigQuery.
export const normalizeSeriesPg = (expr: string) => `
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(TRIM(${expr})), '\\miaaf\\M\\s*', '', 'g'),
            '^world athletics\\s+', ''
          ),
          '^world\\s+', ''
        ),
        '\\s+meeting$', ''
      ),
      '(championships),\\s+.*$', '\\1'
    ),
    '(championships)\\s+in athletics$', '\\1', 'i'
  ))
`;

export const displaySeriesPg = (expr: string) => `
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(TRIM(${expr}), '\\miaaf\\M\\s*', '', 'gi'),
          '^world athletics\\s+', 'World ', 'i'
        ),
        '\\s+meeting$', '', 'i'
      ),
      '(championships),\\s+.*$', '\\1', 'i'
    ),
    '(championships)\\s+in athletics$', '\\1', 'i'
  ))
`;

// BigQuery version of the same normalization -- still needed by
// getUpcomingCompetitions above, which stays on BigQuery (see its comment).
export const normalizeSeries = (expr: string) => `
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(TRIM(${expr})), r'\\biaaf\\b\\s*', ''),
            r'^world athletics\\s+', ''
          ),
          r'^world\\s+', ''
        ),
        r'\\s+meeting$', ''
      ),
      r'(championships),\\s+.*$', r'\\1'
    ),
    r'(?i)(championships)\\s+in athletics$', r'\\1'
  ))
`;

// The /meets/[name] page (getMeetAvailableYears, getMeetResults below)
// reads two small, purpose-built tables instead of events_enriched
// directly -- see matchAthletesIncremental/registry/19_materialize_meet_
// results.sql. events_enriched is clustered by (athlete_id,
// athletics_event, gender, year), none of which helps a page keyed by
// event_name -- measured live, a plain `WHERE event_name = ...` scanned
// 200-330MB and the series-match logic (the old MEET_SERIES_MATCH_SQL)
// ran a correlated subquery that re-scanned the whole table a second time
// just to resolve the target's own series. Splitting the "resolve this
// event_name's series_key" step into its own tiny table
// (registry.meet_series_key, clustered by event_name) lets
// registry.meet_results cluster purely by (series_key, year) -- the only
// way it's ever filtered once the series_key is known -- instead of
// compromising on both. Each step now scans ~10-30MB instead of
// 200-330MB (clustering on a non-leading column barely prunes at all,
// tested live before landing on the two-table split).
// Reads the Postgres serving layer (mirrored from the BigQuery tables
// above by matchAthletesIncremental/serving/export_to_postgres.py) --
// same reasoning as getAthleteSlug: BigQuery's own ~1-2s per-query floor
// doesn't shrink no matter how well-clustered the table is, Postgres
// returns an indexed lookup in milliseconds.
export async function getMeetSeriesKey(eventName: string): Promise<string | null> {
  const rows = await pgQuery<{ series_key: string }>(
    `SELECT series_key FROM meet_series_key WHERE event_name = $1 LIMIT 1`,
    [eventName]
  );
  return rows[0]?.series_key ?? null;
}

// seriesKey can be passed in (the meet page resolves it once up front and
// shares it with getMeetResults below, instead of each resolving it
// separately -- that used to be two identical round trips per page load).
export async function getMeetAvailableYears(eventName: string, seriesKey?: string | null): Promise<number[]> {
  const key = seriesKey !== undefined ? seriesKey : await getMeetSeriesKey(eventName);
  if (!key) return [];
  const rows = await pgQuery<{ year: number }>(
    `SELECT DISTINCT year FROM meet_results WHERE series_key = $1 AND year IS NOT NULL ORDER BY year DESC`,
    [key]
  );
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
  is_shadow_result: boolean | null; // a weaker parallel section merged under the same final -- doesn't score
  race_level: number | null; // field strength of this specific race, 0-100, tier-anchored (see registry/16_compute_race_level.sql)
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
export async function getMeetResults(eventName: string, year: number, seriesKey?: string | null): Promise<MeetResultRow[]> {
  const key = seriesKey !== undefined ? seriesKey : await getMeetSeriesKey(eventName);
  if (!key) return [];
  // mark_value, race_level and the athlete_display_name/combined-round
  // filters are all precomputed in meet_results itself now (see
  // 19_materialize_meet_results.sql) -- no JOIN, no WHERE filtering
  // needed here beyond series_key + year.
  return pgQuery<MeetResultRow>(
    `
    SELECT event_name, COALESCE(display_series_name, event_name) AS series_name,
      athletics_event, gender, round, place, athlete_id,
      display_name, mark_display, mark_value, nationality, record, city, country,
      date::text AS date, wind, wind_legal,
      division_key_resolved, is_shadow_result, race_level
    FROM meet_results
    WHERE series_key = $1 AND year = $2
    -- Finals first, qualifying rounds (heats, semis) after -- reading the
    -- final before its own heats matches how a results page is normally
    -- read, and MeetResultsSections groups by round anyway so mixing the
    -- literal chronological order in isn't needed here.
    ORDER BY athletics_event, gender,
      CASE WHEN round IS NULL OR LOWER(round) LIKE '%final%' THEN 0 ELSE 1 END, round, place ASC NULLS LAST
  `,
    [key, year]
  );
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
  series_key: string | null;
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
  const params: unknown[] = [];
  let idx = 1;
  let genderPh = "";
  let tierPh = "";
  let yearPh = "";
  let disciplinesPh = "";
  let searchPh = "";
  if (gender) { params.push(gender); genderPh = `$${idx++}`; }
  if (tier) { params.push(tier); tierPh = `$${idx++}`; }
  if (year) { params.push(year); yearPh = `$${idx++}`; }
  if (disciplines?.length) { params.push(disciplines); disciplinesPh = `$${idx++}`; }
  if (search) { params.push(search); searchPh = `$${idx++}`; }
  return pgQuery<CompetitionListRow>(`
    SELECT event_name,
      (ARRAY_AGG(display_series_name))[1] AS display_series_name,
      -- Same key the real /meets/[name] page groups editions by
      -- (meet_series_key) -- grouping this debug list by the raw
      -- stored display_series_name instead would show fragmentation
      -- that isn't actually real: e.g. "World Athletics Championships,
      -- Budapest" and "World Championships" already merge on the real
      -- page (both normalize to the same key) even though their stored
      -- display_series_name differs.
      (ARRAY_AGG(${normalizeSeriesPg("display_series_name")}))[1] AS series_key,
      COALESCE(ARRAY_AGG(DISTINCT division_key_resolved) FILTER (WHERE division_key_resolved IS NOT NULL), ARRAY[]::text[]) AS tiers,
      MIN(year) AS min_year, MAX(year) AS max_year,
      COUNT(DISTINCT year) AS n_editions
    FROM events
    WHERE event_name IS NOT NULL
      ${genderPh ? `AND gender = ${genderPh}` : ""}
      ${tierPh ? `AND division_key_resolved = ${tierPh}` : ""}
      ${yearPh ? `AND year = ${yearPh}` : ""}
      ${disciplinesPh ? `AND athletics_event = ANY(${disciplinesPh})` : ""}
      ${searchPh ? `AND (LOWER(event_name) LIKE LOWER('%' || ${searchPh} || '%') OR LOWER(display_series_name) LIKE LOWER('%' || ${searchPh} || '%'))` : ""}
    GROUP BY event_name
    ORDER BY event_name ASC
    LIMIT 300
  `, params);
}

// Strict literal event_name match (unlike getMeetResults, which matches
// every raw name sharing the same display_series_name) -- shows exactly
// what one specific raw name's rows contain, which is the point of the
// competitions browser: spotting a wrongly-named or wrongly-tiered raw
// competition means looking at ONLY its own rows, not a merged group.
export async function getCompetitionResults(eventName: string, year: number): Promise<MeetResultRow[]> {
  return pgQuery<MeetResultRow>(`
    SELECT e.event_name, COALESCE(e.display_series_name, e.event_name) AS series_name,
      e.athletics_event, e.gender, e.round, e.place, e.athlete_id,
      e.athlete_display_name AS display_name, e.mark_display,
      CASE WHEN e.athletics_discipline IN ('Jumps','Throws') THEN ${safeMarkEvents.replace(/\bmark\b/g, "e.mark")} ELSE e.mark_seconds END AS mark_value,
      e.nationality,
      NULLIF(e.record, '') AS record, e.city, e.country, e.date::text AS date, e.wind, e.wind_legal,
      e.division_key_resolved, e.is_shadow_result, rl.race_level
    FROM events e
    LEFT JOIN (
      SELECT event_name AS rl_event_name, athletics_event AS rl_athletics_event,
        gender AS rl_gender, date AS rl_date, round AS rl_round, race_level
      FROM race_level
    ) rl
      ON rl.rl_event_name = e.event_name AND rl.rl_athletics_event = e.athletics_event
     AND rl.rl_gender = e.gender AND rl.rl_date::text = e.date::text
     AND (rl.rl_round = e.round OR (rl.rl_round IS NULL AND e.round IS NULL))
    WHERE e.event_name = $1 AND e.year = $2
      AND LOWER(COALESCE(e.round,'')) NOT LIKE '%combined%'
      AND e.athlete_display_name IS NOT NULL
    ORDER BY e.athletics_event, e.gender,
      CASE WHEN e.round IS NULL OR LOWER(e.round) LIKE '%final%' THEN 0 ELSE 1 END, e.round, e.place ASC NULLS LAST
  `, [eventName, year]);
}

export async function getCompetitionYears(eventName: string): Promise<number[]> {
  const rows = await pgQuery<{ year: number }>(`
    SELECT DISTINCT year
    FROM events
    WHERE event_name = $1 AND year IS NOT NULL
    ORDER BY year DESC
  `, [eventName]);
  return rows.map((r) => r.year);
}

// ---------------------------------------------------------------------
// Year-by-year progression of the best mark, for the evolution chart on
// the discipline page (one point per year: that year's single best mark).
// ---------------------------------------------------------------------

export type YearProgressionPoint = {
  year: number;
  mark_display: string;
  mark_value: number;
  athlete_id?: string | null;
  athlete?: string | null;
  nationality?: string | null;
  slug?: string | null;
};

async function _getEventYearlyProgression(
  event: string,
  gender: string,
  ageCategory?: string
): Promise<YearProgressionPoint[]> {
  const isField = isFieldEvent(event);
  const orderExpr = isField ? `${safeMarkEvents} DESC` : "mark_seconds ASC";
  const windFiltered = ["100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles", "Long Jump", "Triple Jump"].includes(event);
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;

  const rows = await pgQuery<YearProgressionPoint>(`
    SELECT year, mark_display, mark_value, athlete_id, athlete, nationality FROM (
      SELECT year, mark_display,
        ${isField ? safeMarkEvents : "mark_seconds"} AS mark_value,
        athlete_id, athlete_display_name AS athlete, nationality,
        ROW_NUMBER() OVER (PARTITION BY year ORDER BY ${orderExpr}) AS rn
      FROM events
      WHERE athletics_event_base = $1 AND gender = $2 AND year IS NOT NULL
        AND athlete_display_name IS NOT NULL
        AND ${isField ? `${safeMarkEvents} IS NOT NULL` : "mark_seconds IS NOT NULL"}
        ${windFiltered ? "AND (wind_legal IS NULL OR wind_legal = TRUE)" : ""}
        ${ageMax !== undefined ? `AND birth_year IS NOT NULL AND (year - birth_year) <= ${ageMax}` : ""}
    ) z
    WHERE rn = 1
    ORDER BY year ASC
  `, [event, gender]);
  const slugs = await getAthleteSlugs(rows.map((r) => r.athlete_id).filter((id): id is string => !!id));
  for (const r of rows) r.slug = slugs.get(r.athlete_id ?? "") ?? null;
  return rows;
}
export const getEventYearlyProgression = unstable_cache(_getEventYearlyProgression, ["getEventYearlyProgression-v2"], DAY_CACHE);

// ---------------------------------------------------------------------
// Top races of a year by quality (field-strength, see registry/16_compute_race_level.sql)
// or by recency -- Home's third sidebar widget, same shape as the
// athlete/nation stats widgets (gender + discipline group/event filters).
// ---------------------------------------------------------------------

export type TopRaceRow = {
  event_name: string;
  athletics_event: string;
  gender: string;
  date: string | null;
  year: number | null;
  round: string | null;
  race_level: number;
  tier: string | null;
  top_athlete_id: string | null;
  top_athlete: string | null;
  top_nationality: string | null;
  top_mark: string | null;
};

export type TopRaceFilters = { tier?: string; nationality?: string; area?: string; ageCategory?: string };

// Full reference list (not scoped to one discipline's current nationalities
// like getAvailableNationalities above) -- Races filters across every
// discipline at once, so there's no single event to scope the list to.
async function _getAllNationalities(): Promise<NationalityOption[]> {
  return pgQuery<NationalityOption>(`
    SELECT code, name, area FROM countries ORDER BY name
  `);
}
export const getAllNationalities = unstable_cache(_getAllNationalities, ["getAllNationalities"], DAY_CACHE);

// Some historical sources (sports123, mainly pre-2012 marathon majors)
// have no `date` at all, only `year` -- registry/16_compute_race_level.sql
// groups those as one race per year instead of merging a decade of
// editions together (see that file's v6 header). Matches that same
// fallback here so the frontend's join lines up with how race_level was
// actually grouped.
const RACE_KEY_SQL = `COALESCE(date::text, 'Y' || year::text)`;

function racesCte(eventPh: string | null, genderPh: string, yearPh: string | null, indoor: boolean, tierPh?: string) {
  // registry.race_level has no track_key (events_enriched does -- see
  // INDOOR_EXPR above), so this is name-only, the weaker half of that
  // check; good enough here and avoids an extra join.
  const indoorFilter = `AND ${indoor ? "" : "NOT "}LOWER(event_name) LIKE '%indoor%'`;
  return `
    SELECT event_name, athletics_event, gender, date, year, race_key, round, race_level, tier FROM (
      SELECT event_name, athletics_event, gender, date::text AS date, year,
        ${RACE_KEY_SQL} AS race_key, COALESCE(round, '') AS round, race_level, tier,
        ROW_NUMBER() OVER (PARTITION BY event_name, athletics_event, gender, ${RACE_KEY_SQL}, COALESCE(round, '') ORDER BY race_level DESC) AS rn
      FROM race_level
      WHERE gender = ${genderPh}
        ${yearPh ? `AND year = ${yearPh}` : ""}
        ${eventPh ? `AND athletics_event = ${eventPh}` : ""}
        ${tierPh ? `AND tier = ${tierPh}` : ""}
        ${indoorFilter}
    ) z
    WHERE rn = 1
  `;
}

// nationality/area/ageCategory filter on the WINNER of each race (the only
// per-athlete attribute a race-level listing can sensibly filter by) --
// same AGE_CATEGORIES/tablasauxiliares.countries convention as Disciplines.
// When any of those three is set, the winners join switches from LEFT to
// INNER (races whose winner doesn't match the filter are excluded outright,
// not shown with a blank "—" winner).
async function _getTopRaces(
  event: string,
  gender: string,
  year: number | "all",
  sortBy: "quality" | "recent" = "quality",
  pageSize = 10,
  indoor = false,
  page = 1,
  filters: TopRaceFilters = {}
): Promise<TopRaceRow[]> {
  const { tier, nationality, area, ageCategory } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  const winnerFiltered = !!(nationality || area || ageMax);
  const order = sortBy === "recent" ? "race_key DESC, race_level DESC" : "race_level DESC, race_key DESC";

  const params: unknown[] = [gender];
  let idx = 2;
  const genderPh = "$1";
  let yearPh: string | null = null;
  let eventPh: string | null = null;
  let tierPh: string | undefined;
  let nationalityPh: string | undefined;
  let areaPh: string | undefined;
  let ageMaxPh: string | undefined;
  if (year !== "all") { params.push(year); yearPh = `$${idx++}`; }
  if (event !== "all") { params.push(event); eventPh = `$${idx++}`; }
  if (tier) { params.push(tier); tierPh = `$${idx++}`; }
  if (nationality) { params.push(nationality); nationalityPh = `$${idx++}`; }
  if (area) { params.push(area); areaPh = `$${idx++}`; }
  if (ageMax) { params.push(ageMax); ageMaxPh = `$${idx++}`; }

  return pgQuery<TopRaceRow>(`
    WITH races AS (${racesCte(eventPh, genderPh, yearPh, indoor, tierPh)}),
    winners AS (
      SELECT event_name, athletics_event, gender, race_key, round,
        athlete_id, display_name, nationality, mark_display FROM (
        SELECT e.event_name, e.athletics_event, e.gender, ${RACE_KEY_SQL} AS race_key, COALESCE(e.round, '') AS round,
          e.athlete_id, e.athlete_display_name AS display_name, e.nationality, e.mark_display,
          ROW_NUMBER() OVER (PARTITION BY e.event_name, e.athletics_event, e.gender, ${RACE_KEY_SQL}, COALESCE(e.round, '') ORDER BY e.athlete_id) AS rn
        FROM events e
        ${area ? "JOIN countries c ON c.code = e.nationality" : ""}
        WHERE e.place = 1 AND e.gender = ${genderPh}
          ${yearPh ? `AND e.year = ${yearPh}` : ""}
          ${eventPh ? `AND e.athletics_event = ${eventPh}` : ""}
          ${nationalityPh ? `AND e.nationality = ${nationalityPh}` : ""}
          ${areaPh ? `AND c.area = ${areaPh}` : ""}
          ${ageMaxPh ? `AND e.birth_year IS NOT NULL AND (e.year - e.birth_year) <= ${ageMaxPh}` : ""}
      ) w
      WHERE rn = 1
    )
    SELECT r.event_name, r.athletics_event, r.gender, r.date, r.year, r.round, r.race_level, r.tier,
      w.athlete_id AS top_athlete_id, w.display_name AS top_athlete, w.nationality AS top_nationality, w.mark_display AS top_mark
    FROM races r
    ${winnerFiltered ? "JOIN" : "LEFT JOIN"} winners w USING (event_name, athletics_event, gender, race_key, round)
    ORDER BY ${order}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `, params);
}
export const getTopRaces = unstable_cache(_getTopRaces, ["getTopRaces"], DAY_CACHE);

async function _getTopRacesCount(
  event: string,
  gender: string,
  year: number | "all",
  indoor = false,
  filters: TopRaceFilters = {}
): Promise<number> {
  const { tier, nationality, area, ageCategory } = filters;
  const ageMax = ageCategory ? AGE_CATEGORIES[ageCategory] : undefined;
  if (!nationality && !area && !ageMax) {
    const params: unknown[] = [gender];
    let idx = 2;
    const genderPh = "$1";
    let yearPh: string | null = null;
    let eventPh: string | null = null;
    let tierPh: string | undefined;
    if (year !== "all") { params.push(year); yearPh = `$${idx++}`; }
    if (event !== "all") { params.push(event); eventPh = `$${idx++}`; }
    if (tier) { params.push(tier); tierPh = `$${idx++}`; }
    const rows = await pgQuery<{ n: number }>(`
      SELECT COUNT(*) AS n FROM (${racesCte(eventPh, genderPh, yearPh, indoor, tierPh)}) zz
    `, params);
    return rows[0]?.n ?? 0;
  }
  // winner-filtered: count via the same join getTopRaces uses, uncapped.
  const rows = await getTopRaces(event, gender, year, "quality", 100000, indoor, 1, filters);
  return rows.length;
}
export const getTopRacesCount = unstable_cache(_getTopRacesCount, ["getTopRacesCount"], DAY_CACHE);

async function _getRaceYears(): Promise<number[]> {
  const rows = await pgQuery<{ year: number }>(`
    SELECT DISTINCT year
    FROM race_level
    WHERE year IS NOT NULL
    ORDER BY year DESC
  `);
  return rows.map((r) => r.year);
}
export const getRaceYears = unstable_cache(_getRaceYears, ["getRaceYears"], DAY_CACHE);

// ---------------------------------------------------------------------
// Olympic / World Championships record of an athlete, for the bio box:
// appearances (distinct editions) and medals. OW tier holds exactly the
// Olympics and the outdoor Worlds (plus the new Ultimate Championship,
// left out). Medals only from finals.
// ---------------------------------------------------------------------

export type ChampionshipRecord = {
  kind: "olympics" | "worlds" | "nationals";
  editions: { year: number; event_name: string }[];
  gold: number;
  silver: number;
  bronze: number;
};

export async function getAthleteChampionships(athleteId: string): Promise<ChampionshipRecord[]> {
  return pgQuery<ChampionshipRecord>(
    `
    WITH me AS (
      SELECT (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nat
      FROM events WHERE athlete_id = $1
    ),
    r AS (
      SELECT
        CASE WHEN event_name ~* 'olympic games' THEN 'olympics' ELSE 'worlds' END AS kind,
        year, event_name, athletics_event, place, round
      FROM events
      WHERE athlete_id = $1 AND division_key_resolved = 'OW'
        AND event_name !~* 'ultimate'
      UNION ALL
      -- senior national championships: "<Nationality> Championships", tier B,
      -- held in the athlete's own country; no NCAA, age groups, indoor or
      -- area championships
      SELECT 'nationals', e.year, e.event_name, e.athletics_event, e.place, e.round
      FROM events e, me
      WHERE e.athlete_id = $1 AND e.division_key_resolved = 'B'
        AND e.country = me.nat
        AND e.event_name ~* 'championships'
        AND e.event_name !~* 'world|europe|asia|africa|continental|olympic|commonwealth|ncaa|college|universit|u18|u20|u23|junior|youth|indoor|masters|area|balkan|nordic|ibero|pan am|oceania|south american|nacac'
    ),
    editions AS (
      SELECT kind, year, (ARRAY_AGG(event_name))[1] AS event_name FROM r GROUP BY kind, year
    ),
    medals AS (
      -- one medal per discipline and edition (100m gold + relay gold the
      -- same year are two medals), finals only
      SELECT kind,
        COUNT(*) FILTER (WHERE place = 1) AS gold,
        COUNT(*) FILTER (WHERE place = 2) AS silver,
        COUNT(*) FILTER (WHERE place = 3) AS bronze
      FROM (
        SELECT DISTINCT kind, year, athletics_event, place
        FROM r
        WHERE place BETWEEN 1 AND 3
          AND (round IS NULL OR round = ''
               OR (LOWER(round) LIKE '%final%' AND LOWER(round) NOT LIKE '%semi%' AND LOWER(round) NOT LIKE '%quarter%'))
      ) t
      GROUP BY kind
    )
    SELECT e.kind,
      json_agg(json_build_object('year', e.year, 'event_name', e.event_name) ORDER BY e.year) AS editions,
      COALESCE(MAX(m.gold), 0) AS gold,
      COALESCE(MAX(m.silver), 0) AS silver,
      COALESCE(MAX(m.bronze), 0) AS bronze
    FROM editions e
    LEFT JOIN medals m USING (kind)
    GROUP BY e.kind
    ORDER BY e.kind DESC
  `,
    [athleteId]
  );
}

// ---------------------------------------------------------------------
// Record-type stats for the athlete's Key Stats, computed from marks
// (the source barely flags records): outdoor, wind-legal, individual
// events only. A tie at the top counts for everyone sharing it.
//   wr: events where the athlete holds the best mark ever in our data
//   nr: events where they hold the best mark of their nationality
//   wl: (event, season) pairs where they had the year's best mark
// ---------------------------------------------------------------------

export type AthleteRecordStats = { wr: number; nr: number; wl: number };

// best_all/best_nat/best_year now come from registry.discipline_best_marks
// (see matchAthletesIncremental/registry/21_materialize_discipline_best_
// marks.sql), precomputed daily, instead of scanning every athlete who's
// ever competed in each of the athlete's disciplines live -- that scan
// alone took ~5s for Bolt's sprint disciplines, dominating this page's
// load time even after every other query here moved to Postgres. Only
// the athlete's OWN marks (mine_best/mine_year, already athlete_id-
// filtered and fast) are still computed live.
export async function getAthleteRecordStats(athleteId: string): Promise<AthleteRecordStats> {
  const events = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women])));
  const safeMark = `CASE WHEN t.mark ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN t.mark::double precision ELSE NULL END`;
  const rows = await pgQuery<AthleteRecordStats>(
    `
    WITH mine AS (
      SELECT DISTINCT athletics_event, gender
      FROM events
      WHERE athlete_id = $1 AND athletics_discipline NOT IN ('Relays')
        -- official catalogue events only: a "record" in 150m straight or
        -- 300m would be meaningless
        AND athletics_event = ANY($2)
    ),
    marks AS (
      SELECT t.athletics_event, t.gender, t.athlete_id, t.nationality, t.year,
        -- lower is better for every event once field marks are negated
        CASE WHEN t.athletics_discipline IN ('Jumps', 'Throws', 'Combined Events') THEN -(${safeMark}) ELSE t.mark_seconds END AS v
      FROM events t
      JOIN mine USING (athletics_event, gender)
      WHERE t.athlete_id = $1
        AND COALESCE(t.wind_legal, TRUE)
        AND NOT (COALESCE(t.track_key, '') = 'Short Track' OR LOWER(t.event_name) LIKE '%indoor%')
    ),
    valid AS (SELECT * FROM marks WHERE v IS NOT NULL AND v != 0),
    me AS (
      SELECT (ARRAY_AGG(nationality ORDER BY year DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nat
      FROM valid
    ),
    best_all AS (
      SELECT athletics_event, gender, best_v AS best FROM discipline_best_marks
      WHERE scope_type = 'all' AND (athletics_event, gender) IN (SELECT athletics_event, gender FROM mine)
    ),
    best_nat AS (
      SELECT d.athletics_event, d.gender, d.best_v AS best
      FROM discipline_best_marks d, me
      WHERE d.scope_type = 'nation' AND d.scope_key = me.nat
        AND (d.athletics_event, d.gender) IN (SELECT athletics_event, gender FROM mine)
    ),
    best_year AS (
      SELECT athletics_event, gender, scope_key::int AS year, best_v AS best FROM discipline_best_marks
      WHERE scope_type = 'year' AND (athletics_event, gender) IN (SELECT athletics_event, gender FROM mine)
    ),
    mine_best AS (
      SELECT athletics_event, gender, MIN(v) AS pb FROM valid GROUP BY 1, 2
    ),
    mine_year AS (
      SELECT athletics_event, gender, year, MIN(v) AS sb FROM valid GROUP BY 1, 2, 3
    )
    SELECT
      (SELECT COUNT(*) FROM mine_best m JOIN best_all b USING (athletics_event, gender) WHERE m.pb <= b.best) AS wr,
      (SELECT COUNT(*) FROM mine_best m JOIN best_nat b USING (athletics_event, gender) WHERE m.pb <= b.best) AS nr,
      (SELECT COUNT(*) FROM mine_year m JOIN best_year b USING (athletics_event, gender, year) WHERE m.sb <= b.best) AS wl
  `,
    [athleteId, events]
  );
  return rows[0] ?? { wr: 0, nr: 0, wl: 0 };
}

// Nationality history (athletics_all.athlete_nationality, built by the
// nationality normalization step): one entry per country the athlete
// competed for, oldest first. Runs of fewer than 3 results are ignored
// (stray source slips, not a change of allegiance).
export type NationalitySpan = { nationality: string; first_year: number; last_year: number; n_results: number };

export async function getAthleteNationalityHistory(athleteId: string): Promise<NationalitySpan[]> {
  return pgQuery<NationalitySpan>(`
    SELECT nationality, EXTRACT(YEAR FROM MIN(from_date)) AS first_year, EXTRACT(YEAR FROM MAX(to_date)) AS last_year,
      SUM(n_results) AS n_results
    FROM athlete_nationality
    WHERE athlete_id = $1
    GROUP BY nationality
    HAVING SUM(n_results) >= 3
    ORDER BY first_year
  `, [athleteId]);
}
