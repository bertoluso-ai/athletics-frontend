import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { EVENT_GROUPS, groupEvents, isRelayEvent } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import { getAllNationalities, getGlobalYearRanking, getAthleteSlugs, getEventAvailableYears } from "@/lib/queries";
import { pgQuery } from "@/lib/pg";

const BASE = "https://athleticsinforanking.com";
const TOP_ATHLETES_PER_GENDER = 2500; // los atletas con mas puntos de toda la historia; el resto se descubre por enlaces internos

// Se calcula como mucho una vez al dia (el ranking historico es una agregacion pesada) y nunca debe tumbar el sitemap:
// si la base falla, se devuelve la parte estatica.
const topAthletePaths = unstable_cache(
  async (): Promise<string[]> => {
    const out: string[] = [];
    for (const gender of ["Men", "Women"] as const) {
      const rows = await getGlobalYearRanking(gender, "all", 1, TOP_ATHLETES_PER_GENDER);
      const slugs = await getAthleteSlugs(rows.map((r) => r.athlete_id));
      for (const r of rows) {
        const s = slugs.get(r.athlete_id);
        if (s) out.push(`/athletes/${s}`);
      }
    }
    return out;
  },
  ["sitemap-top-athletes-v1"],
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
    const out: string[] = [];
    const seen = new Set<string>();
    for (const g of EVENT_GROUPS) {
      for (const gender of ["Men", "Women"] as const) {
        for (const e of groupEvents(g, gender)) {
          if (isRelayEvent(e)) continue;
          const gs = gender === "Men" ? "men" : "women";
          const base = `/disciplines/${eventSlug(e)}/${gs}`;
          const years = (await getEventAvailableYears(e, gender)).filter((y) => y >= 2000);
          if (years.length === 0) continue;
          if (!seen.has(base)) { seen.add(base); out.push(base); }
          for (const y of years) {
            const path = `${base}/${y}`;
            if (!seen.has(path)) { seen.add(path); out.push(path); }
          }
        }
      }
    }
    return out;
  },
  ["sitemap-seasons-v2"],
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
    meets = (await topMeetPaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    seasons = (await seasonPaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    records = (await recordCountryCodes()).map((c) => ({ url: `${BASE}/countries/${c}/records`, changeFrequency: "monthly" as const, priority: 0.5 }));
    athletes = (await topAthletePaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.5 }));
  } catch {
    /* sin base de datos (build, error puntual): solo la parte estatica */
  }
  return [...hubs, ...disciplines, ...seasons, ...countries, ...records, ...meets, ...athletes];
}
