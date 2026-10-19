import { Pool, types } from "pg";

// node-postgres returns NUMERIC (oid 1700) and INT8/BIGINT (oid 20) as
// strings by default, to avoid silent precision loss -- but every one of
// these queries just wants a plain JS number (points, counts, ranks), same
// as what BigQuery's client already handed back before this migration.
// Parsing them here once instead of CAST()-ing every query result.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

// Serving-layer database (Postgres 18 en el VPS de Hetzner; antes Cloud SQL) -- a read-only mirror of BigQuery's
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
// Seguridad de la conexion (ver athletics-database/serving/ROL_SOLO_LECTURA.md):
//  * PG_SERVING_USER: rol con el que entra la web. Debe ser un rol de SOLO LECTURA (serving_ro); "serving" es el dueño de las tablas y escribe.
//    Sin la variable se usa "serving" SOLO fuera de produccion; en produccion (VERCEL_ENV=production) falta la variable => error (falla cerrado).
//  * PG_SERVING_CA: certificado del servidor en formato PEM, con los saltos de linea escritos como \n. Con el, la conexion SOLO acepta ese
//    certificado (fijado): un tercero en medio de la conexion no puede suplantar al servidor. El certificado es autofirmado y no lleva el nombre del host,
//    por eso no se comprueba el nombre, solo que sea exactamente ese certificado.
//    Sin la variable solo se admite fuera de produccion; en produccion falta la variable => error (falla cerrado).
const pgCa = process.env.PG_SERVING_CA?.replace(/\\n/g, "\n").trim();
const isProd = process.env.VERCEL_ENV === "production";
if (isProd && (!pgCa || !process.env.PG_SERVING_USER?.trim() || process.env.PG_SERVING_USER.trim() === "serving")) {
  throw new Error("Produccion exige PG_SERVING_USER (rol de solo lectura distinto de 'serving') y PG_SERVING_CA");
}
const pool = new Pool({
  host: process.env.PG_SERVING_HOST?.trim(),
  port: 5432,
  user: process.env.PG_SERVING_USER?.trim() || "serving",
  password: process.env.PG_SERVING_PASSWORD?.trim(),
  database: "athletics",
  ssl: pgCa ? { ca: pgCa, rejectUnauthorized: true, checkServerIdentity: () => undefined } : { rejectUnauthorized: false },
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
