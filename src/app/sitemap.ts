import type { MetadataRoute } from "next";
import { EVENT_GROUPS } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

const BASE = "https://athleticsinforanking.com";

// Solo paginas indice y disciplinas (estaticas). Las fichas de atleta y reuniones se descubren por enlaces internos;
// si hace falta listarlas, anadir aqui una consulta limitada (top N) en vez de enumerar todo.
export default function sitemap(): MetadataRoute.Sitemap {
  const hubs = ["", "/rankings", "/meets", "/countries", "/h2h", "/about"].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.8 }));
  const events = new Set<string>();
  for (const g of EVENT_GROUPS) for (const side of [g.events.Men, g.events.Women]) for (const e of side) events.add(e);
  const disciplines = [...events].map((e) => ({ url: `${BASE}/disciplines/${eventSlug(e)}`, changeFrequency: "weekly" as const, priority: 0.7 }));
  return [...hubs, ...disciplines];
}
