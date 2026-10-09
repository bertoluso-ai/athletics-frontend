import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Calendar and Races were merged into /meets (competitions view / races
  // view). Old links and bookmarks keep working; query strings are carried
  // over, and /meets accepts the old /races parameter names (event, indoor,
  // sort=recent).
  async redirects() {
    return [
      { source: "/calendar", destination: "/meets", permanent: true },
      { source: "/races", destination: "/meets?view=races", permanent: true },
    ];
  },
};

export default nextConfig;
