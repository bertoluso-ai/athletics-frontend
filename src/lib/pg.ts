import { Pool, types } from "pg";

// node-postgres returns NUMERIC (oid 1700) and INT8/BIGINT (oid 20) as
// strings by default, to avoid silent precision loss -- but every one of
// these queries just wants a plain JS number (points, counts, ranks), same
// as what BigQuery's client already handed back before this migration.
// Parsing them here once instead of CAST()-ing every query result.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

// Serving-layer database (Cloud SQL Postgres, instance "athletics-serving"
// in athletics-database/europe-west1) -- a read-only mirror of BigQuery's
// small, precomputed tables (athlete_slugs, race_level, meet_results,
// country_season_points, ...), refreshed by matchAthletesIncremental's
// serving/export_to_postgres.py right after each BigQuery ETL job.
//
// Why a second database at all: BigQuery has a fixed ~1-2s per-query
// latency floor (job dispatch, distributed query planning) regardless of
// how little data is scanned -- confirmed repeatedly clustering/
// materializing tables this session: bytes scanned dropped 10-20x, wall
// time barely moved. That's fine for BigQuery's own daily batch jobs, not
// for serving many small reads per page load. Postgres point/indexed
// reads come back in single-digit milliseconds instead.
//
// Pooled per serverless function instance (Vercel reuses warm instances
// between invocations, so this isn't a new connection per request in
// practice). `max: 3` was too low -- a single athlete-profile page load
// fires 6+ of these in parallel (Promise.all across getAthleteBestResults/
// Events/PersonalBests/YearlyPoints/Championships/RecordStats), and with
// only 3 slots the rest queued behind each other, caught live as an
// 11s page load that should have been well under 1s. The db-custom-2-7680
// instance comfortably handles far more than this.
// .trim() defensively -- a trailing newline snuck into the env var once
// (piped in via `echo` when it was first set on Vercel) and broke DNS
// resolution for the host at build time with a cryptic ENOTFOUND.
const pool = new Pool({
  host: process.env.PG_SERVING_HOST?.trim(),
  port: 5432,
  user: "serving",
  password: process.env.PG_SERVING_PASSWORD?.trim(),
  database: "athletics",
  ssl: { rejectUnauthorized: false },
  max: 15,
  idleTimeoutMillis: 30000,
});

export async function pgQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
