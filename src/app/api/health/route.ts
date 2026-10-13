import { NextResponse } from "next/server";
import { pgQuery } from "@/lib/pg";

// Salud del sistema para el uptime check de Cloud Monitoring (una sola URL cubre: web arriba, Postgres arriba, export fresco,
// scraper fresco y espacio en disco del VPS). Responde 503 si algo esta degradado -> el uptime check falla -> alarma por email.
// No usa cache: es barato (4 consultas triviales).
export const dynamic = "force-dynamic";

const DISK_GB = 75; // disco del VPS (Hetzner CAX21)
const OVERHEAD_GB = 9; // WAL (tope 6 GB) + sistema/logs/cache
const DISK_LIMIT = 0.8;
const EXPORT_MAX_HOURS = 30;
const SCRAPE_MAX_DAYS = 5;

type Check = { name: string; ok: boolean; detail: string };

export async function GET() {
  const checks: Check[] = [];
  try {
    await pgQuery("SELECT 1");
    checks.push({ name: "postgres", ok: true, detail: "up" });

    const [exp] = await pgQuery<{ hours: number }>(
      `SELECT EXTRACT(EPOCH FROM (now() - GREATEST(last_analyze, last_autoanalyze))) / 3600.0 AS hours
       FROM pg_stat_user_tables WHERE relname = 'events'`
    );
    const hours = Number(exp?.hours ?? 9999);
    checks.push({ name: "export_fresco", ok: hours <= EXPORT_MAX_HOURS, detail: `events cargada hace ${hours.toFixed(1)} h (max ${EXPORT_MAX_HOURS})` });

    const [last] = await pgQuery<{ days: number; d: string }>(`SELECT (CURRENT_DATE - MAX(date))::int AS days, MAX(date)::text AS d FROM events`);
    const days = Number(last?.days ?? 9999);
    checks.push({ name: "scraper_fresco", ok: days <= SCRAPE_MAX_DAYS, detail: `ultimo resultado ${last?.d} (hace ${days} dias, max ${SCRAPE_MAX_DAYS})` });

    const [sz] = await pgQuery<{ gb: number }>(`SELECT pg_database_size(current_database()) / 1073741824.0 AS gb`);
    const used = Number(sz?.gb ?? 0) + OVERHEAD_GB;
    checks.push({ name: "disco", ok: used <= DISK_GB * DISK_LIMIT, detail: `uso estimado ${used.toFixed(1)} GB de ${DISK_GB} (limite ${(DISK_GB * DISK_LIMIT).toFixed(0)} GB)` });
  } catch (e) {
    checks.push({ name: "postgres", ok: false, detail: `error: ${(e as Error).message.slice(0, 120)}` });
  }
  const ok = checks.every((c) => c.ok);
  return NextResponse.json({ status: ok ? "ok" : "degraded", checks }, { status: ok ? 200 : 503 });
}
