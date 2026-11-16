import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { EVENT_GROUPS, groupEvents, isRelayEvent } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import { getAllNationalities } from "@/lib/queries";
import { pgQuery } from "@/lib/pg";

const BASE = "https://athleticsinforanking.com";

// Los mejores atletas de cada genero (rnk <= 3000 del indice global ya calculado, athlete_global_index): una sola consulta de ~1 s.
// Las demas fichas se descubren por los enlaces de rankings, listas historicas y ganadores.
const TOP_ATHLETES_PER_GENDER = 3000;
const topAthletePaths = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await pgQuery<{ slug: string }>(
      `SELECT s.slug FROM athlete_global_index g JOIN athlete_slugs s USING (athlete_id)
        WHERE g.rnk <= $1 ORDER BY g.rnk, s.slug`,
      [TOP_ATHLETES_PER_GENDER]
    );
    return rows.map((r) => `/athletes/${r.slug}`);
  },
  ["sitemap-top-athletes-v2"],
  { revalidate: 86400 }
);

// Series con al menos 3 ediciones con resultados, las mas largas primero (BAUHAUS-Galan, Athletissima, mundiales...). Se usa el nombre mas reciente,
// que es el que resuelve /meets/[name].
const topMeetPaths = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await pgQuery<{ n: string; eds: number }>(
      `SELECT (ARRAY_AGG(event_name ORDER BY year DESC))[1] AS n, COUNT(DISTINCT year)::int AS eds
         FROM meet_results WHERE series_key IS NOT NULL AND event_name IS NOT NULL
         GROUP BY series_key HAVING COUNT(DISTINCT year) >= 3 ORDER BY eds DESC, n LIMIT 3000`
    );
    return rows.map((r) => `/meets/${encodeURIComponent(r.n)}`);
  },
  ["sitemap-top-meets-v1"],
  { revalidate: 86400 }
);

// Paginas por prueba y genero (/disciplines/<prueba>/<men|women>) y rankings de temporada (.../<año>): solo años 2000+ en los que hay marcas.
const seasonPaths = unstable_cache(
  async (): Promise<string[]> => {
    // Una sola consulta (antes eran ~100, una por prueba y genero): combinaciones prueba/genero/año 2000+ con marcas.
    const valid = new Set<string>();
    for (const g of EVENT_GROUPS) {
      for (const gender of ["Men", "Women"] as const) {
        for (const e of groupEvents(g, gender)) if (!isRelayEvent(e)) valid.add(`${e}|${gender}`);
      }
    }
    const rows = await pgQuery<{ ev: string; gender: string; year: number }>(
      `SELECT athletics_event_base AS ev, gender, year FROM events
        WHERE year >= 2000 AND gender IN ('Men','Women') AND athletics_event_base IS NOT NULL
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3 DESC`
    );
    const out: string[] = [];
    const bases = new Set<string>();
    for (const r of rows) {
      if (!valid.has(`${r.ev}|${r.gender}`)) continue;
      const base = `/disciplines/${eventSlug(r.ev)}/${r.gender === "Men" ? "men" : "women"}`;
      if (!bases.has(base)) { bases.add(base); out.push(base); }
      out.push(`${base}/${r.year}`);
    }
    return out;
  },
  ["sitemap-seasons-v3"],
  { revalidate: 86400 }
);

// Paises con suficientes atletas como para tener pagina de mejores marcas (/countries/<codigo>/records).
const recordCountryCodes = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await pgQuery<{ nationality: string }>(
      `SELECT nationality FROM events WHERE nationality IS NOT NULL AND athlete_id IS NOT NULL GROUP BY nationality HAVING COUNT(DISTINCT athlete_id) >= 40 ORDER BY nationality`
    );
    return rows.map((r) => r.nationality.toLowerCase());
  },
  ["sitemap-record-countries-v1"],
  { revalidate: 86400 }
);

// Se genera al pedirlo (no al construir la imagen: ahi no hay que consultar la base y la construccion no debe depender de ella).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hubs = ["", "/rankings", "/records", "/meets", "/countries", "/h2h", "/about"].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.8 }));
  const events = new Set<string>();
  for (const g of EVENT_GROUPS) for (const side of [g.events.Men, g.events.Women]) for (const e of side) events.add(e);
  const disciplines = [...events].map((e) => ({ url: `${BASE}/disciplines/${eventSlug(e)}`, changeFrequency: "weekly" as const, priority: 0.7 }));

  let countries: MetadataRoute.Sitemap = [];
  let athletes: MetadataRoute.Sitemap = [];
  let meets: MetadataRoute.Sitemap = [];
  let seasons: MetadataRoute.Sitemap = [];
  let records: MetadataRoute.Sitemap = [];
  try {
    countries = (await getAllNationalities()).map((c) => ({ url: `${BASE}/countries/${c.code.toLowerCase()}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    athletes = (await topAthletePaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.5 }));
    meets = (await topMeetPaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    seasons = (await seasonPaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    records = (await recordCountryCodes()).map((c) => ({ url: `${BASE}/countries/${c}/records`, changeFrequency: "monthly" as const, priority: 0.5 }));
  } catch {
    /* sin base de datos (build, error puntual): solo la parte estatica */
  }
  return [...hubs, ...disciplines, ...seasons, ...countries, ...records, ...meets, ...athletes];
}
