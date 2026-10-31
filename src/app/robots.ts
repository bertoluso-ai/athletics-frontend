import type { MetadataRoute } from "next";

const BASE = "https://athleticsinforanking.com";

// Mientras el sitio sea privado (proxy.ts) esto no lo ve nadie ni se indexa; queda listo para el dia de la publicacion.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/competitions/"] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
