import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { pgQuery } from "@/lib/pg";

// Bateria de regresion de DATOS: cada comprobacion corresponde a un problema real que ya se corrigio y no debe volver
// (duplicados entre fuentes, homonimos fundidos, series partidas, filas retiradas que reaparecen...).
// Un uptime check de Cloud Monitoring la consulta; 503 si alguna falla. Cacheada 10 min.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, unknown>;
type Def = { name: string; sql: string; ok: (r: Row[]) => boolean; why: string };

const CHECKS: Def[] = [
  {
    name: "ortega_2019_sin_duplicados",
    why: "Resultados duplicados entre dlmeetings y worldathletics reinsertados por cargas con ventana ancha",
    sql: `SELECT COUNT(*)::int AS n, COUNT(DISTINCT (date, athletics_event, mark_display, place, round))::int AS d
          FROM events WHERE athlete_display_name = 'Orlando Ortega' AND year = 2019 AND athletics_event = '110 Metres Hurdles'`,
    ok: (r) => Number(r[0]?.n) >= 15 && Number(r[0]?.n) === Number(r[0]?.d),
  },
  {
    name: "duplicados_sin_ronda_vs_final",
    why: "Misma actuacion con ronda vacia y con 'Final' (patron de los duplicados entre fuentes)",
    sql: `SELECT COUNT(*)::int AS n FROM (
            SELECT athlete_id, date, athletics_event, mark_display, place FROM events
            WHERE athlete_id IS NOT NULL AND date IS NOT NULL AND place IS NOT NULL AND athletics_discipline IS DISTINCT FROM 'Relays' AND year >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
            GROUP BY 1,2,3,4,5
            HAVING COUNT(*) FILTER (WHERE round IS NULL OR round = '') > 0 AND COUNT(*) FILTER (WHERE round ILIKE 'final%') > 0) x`,
    ok: (r) => Number(r[0]?.n) <= 50,
  },
  {
    name: "jose_de_assis_son_dos",
    why: "Homonimos de epocas distintas fundidos en un solo atleta",
    sql: `SELECT COUNT(DISTINCT athlete_id)::int AS n FROM events WHERE athlete_display_name = 'Jose De Assis' AND nationality = 'BRA'`,
    ok: (r) => Number(r[0]?.n) >= 2,
  },
  {
    name: "gemili_commonwealth_2014_en_su_ficha",
    why: "Filas de Wikipedia ligadas a otro atleta del mismo nombre (ENG vs GBR)",
    sql: `SELECT COUNT(*)::int AS n FROM events WHERE athlete_display_name = 'Adam Gemili' AND event_name = 'Commonwealth Games' AND year = 2014
            AND athlete_id = (SELECT athlete_id FROM events WHERE athlete_display_name = 'Adam Gemili' GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1)`,
    ok: (r) => Number(r[0]?.n) >= 1,
  },
  {
    name: "asian_games_2006_final_100m",
    why: "Final partida en dos secciones por mezcla de fuentes (sports123 + Wikipedia)",
    sql: `SELECT STRING_AGG(place::text, ',' ORDER BY place) AS p FROM events
          WHERE event_name = 'Asian Games' AND year = 2006 AND athletics_event = '100 Metres' AND gender = 'Men' AND round = 'Final' AND place <= 3`,
    ok: (r) => r[0]?.p === "1,2,3",
  },
  {
    name: "sin_campeonatos_de_españa_wikipedia",
    why: "El club venia pegado al nombre; la serie se retiro",
    sql: `SELECT COUNT(*)::int AS n FROM events WHERE event_name = 'Spanish Championships' AND year < 2018`,
    ok: (r) => Number(r[0]?.n) === 0,
  },
  {
    name: "volumen_de_tablas",
    why: "Una carga o un swap incompleto dejaria tablas vacias o recortadas",
    sql: `SELECT (SELECT COUNT(*) FROM events)::int AS ev, (SELECT COUNT(*) FROM meet_results)::int AS mr, (SELECT COUNT(*) FROM athlete_slugs)::int AS sl,
                 (SELECT COUNT(*) FROM athlete_global_index)::int AS gi`,
    ok: (r) => Number(r[0]?.ev) > 5_500_000 && Number(r[0]?.mr) > 4_500_000 && Number(r[0]?.sl) > 400_000 && Number(r[0]?.gi) > 120_000,
  },
  {
    name: "slugs_unicos",
    why: "URLs de atleta duplicadas harian que dos personas compartan ficha",
    sql: `SELECT (COUNT(*) - COUNT(DISTINCT slug))::int AS dup FROM athlete_slugs`,
    ok: (r) => Number(r[0]?.dup) === 0,
  },
  {
    name: "nombres_de_relevo_pegados",
    why: "Plantillas de relevos sin separar en un solo 'atleta' (4 nombres juntos)",
    sql: `SELECT COUNT(*)::int AS n FROM events WHERE athletics_discipline = 'Relays' AND year >= 2023 AND LENGTH(athlete_display_name) > 60`,
    ok: (r) => Number(r[0]?.n) <= 400,
  },
];

const run = unstable_cache(
  async () => {
    const out = await Promise.all(
      CHECKS.map(async (c) => {
        try {
          const rows = await pgQuery<Row>(c.sql);
          return { name: c.name, ok: c.ok(rows), why: c.why } as { name: string; ok: boolean; why: string; error?: string };
        } catch (e) {
          return { name: c.name, ok: false, why: c.why, error: (e as Error).message.slice(0, 120) };
        }
      })
    );
    return out;
  },
  ["data-regression-v1"],
  { revalidate: 600 }
);

export async function GET() {
  const results = await run();
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ status: failed.length === 0 ? "ok" : "degraded", failed, total: results.length }, { status: failed.length === 0 ? 200 : 503 });
}
