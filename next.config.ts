import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo para el despliegue en contenedor (VPS): genera un servidor autonomo en .next/standalone. En Vercel no se define y no cambia nada.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // Calendar and Races were merged into /meets (competitions view / races
  // view). Old links and bookmarks keep working; query strings are carried
  // over, and /meets accepts the old /races parameter names (event, indoor,
  // sort=recent).
  async redirects() {
    return [
      { source: "/calendar", destination: "/meets", permanent: true },
      { source: "/competitions", destination: "/meets", permanent: false },
      { source: "/races", destination: "/meets?view=races", permanent: true },
    ];
  },
};

export default nextConfig;
