import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { EVENT_GROUPS } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import { getAllNationalities, getGlobalYearRanking, getAthleteSlugs } from "@/lib/queries";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hubs = ["", "/rankings", "/meets", "/countries", "/h2h", "/about"].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.8 }));
  const events = new Set<string>();
  for (const g of EVENT_GROUPS) for (const side of [g.events.Men, g.events.Women]) for (const e of side) events.add(e);
  const disciplines = [...events].map((e) => ({ url: `${BASE}/disciplines/${eventSlug(e)}`, changeFrequency: "weekly" as const, priority: 0.7 }));

  let countries: MetadataRoute.Sitemap = [];
  let athletes: MetadataRoute.Sitemap = [];
  let meets: MetadataRoute.Sitemap = [];
  try {
    countries = (await getAllNationalities()).map((c) => ({ url: `${BASE}/countries/${c.code}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    meets = (await topMeetPaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    athletes = (await topAthletePaths()).map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: 0.5 }));
  } catch {
    /* sin base de datos (build, error puntual): solo la parte estatica */
  }
  return [...hubs, ...disciplines, ...countries, ...meets, ...athletes];
}
