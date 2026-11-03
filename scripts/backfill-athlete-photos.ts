// Rellena athlete_photos para los mejores atletas que aun no tienen foto resuelta en la clave que usa la ficha (nombre, año de nacimiento).
// Uso:  PHOTO_LOOKUP_UA="..." npx tsx --env-file=.env.local scripts/backfill-athlete-photos.ts [--top=1500] [--dry]
//   --top=N  los N mejores de cada genero segun athlete_global_index (por defecto 1500)
//   --dry    solo cuenta candidatos, no consulta Wikimedia ni escribe
// Candidatos: sin entrada, o con "sin foto" guardado (hubo un fallo que guardaba como negativo los 429/5xx de Wikimedia, ya corregido).
// Pausa entre atletas y reintento con espera ante fallos transitorios; se puede relanzar: los que ya tienen foto se saltan.
import { pgQuery } from "../src/lib/pg";
import { refreshAthletePhoto } from "../src/lib/wikipedia";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const TOP = Number(arg("top") ?? 1500);
const DRY = process.argv.includes("--dry");
const PAUSE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cand = { nm: string; by: number | null; rnk: number };

async function main() {
  const cands = await pgQuery<Cand>(
    `WITH top AS (SELECT athlete_id, rnk FROM athlete_global_index WHERE rnk <= $1),
          info AS (SELECT t.athlete_id, t.rnk, (array_agg(e.athlete_display_name))[1] AS nm, max(e.birth_year) AS by
                   FROM top t JOIN events e ON e.athlete_id = t.athlete_id GROUP BY 1, 2)
     SELECT i.nm, i.by, i.rnk FROM info i
     LEFT JOIN athlete_photos p ON p.name = i.nm AND p.birth_year = COALESCE(i.by, 0)
     WHERE i.nm IS NOT NULL AND (p.name IS NULL OR p.url IS NULL)
     ORDER BY i.rnk, i.nm`,
    [TOP]
  );
  const unicos = [...new Map(cands.map((c) => [`${c.nm}|${c.by ?? 0}`, c])).values()];
  console.log(`candidatos: ${unicos.length} (top ${TOP} por genero)${DRY ? " [dry]" : ""}`);
  if (DRY) return;

  const stats = { found: 0, none: 0, error: 0 };
  let backoff = 0;
  for (let i = 0; i < unicos.length; i++) {
    const c = unicos[i];
    let r = await refreshAthletePhoto(c.nm, c.by);
    for (let k = 0; r === "error" && k < 3; k++) {
      backoff = Math.min(60_000, (backoff || 5_000) * 2); // espera creciente si Wikimedia limita
      console.log(`  limitado, espero ${backoff / 1000}s`);
      await sleep(backoff);
      r = await refreshAthletePhoto(c.nm, c.by);
    }
    if (r !== "error") backoff = 0;
    stats[r]++;
    if ((i + 1) % 50 === 0 || i === unicos.length - 1) console.log(`${i + 1}/${unicos.length}  con foto ${stats.found}  sin foto ${stats.none}  errores ${stats.error}`);
    await sleep(PAUSE_MS);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
