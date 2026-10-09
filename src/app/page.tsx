import Link from "next/link";
import { getLatestRaces, getEventYearlyProgression } from "@/lib/queries";
import { getUpcomingHome } from "@/lib/calendar";
import StatsWidget from "@/components/StatsWidget";
import NationsStatsWidget from "@/components/NationsStatsWidget";
import RacesStatsWidget from "@/components/RacesStatsWidget";
import LatestResults from "@/components/LatestResults";
import { BASE_TIERS } from "@/lib/events";
import UpcomingRaces from "@/components/UpcomingRaces";
import HomeProgressionWidget from "@/components/HomeProgressionWidget";

export const revalidate = 3600; // 1h: no need to hit BigQuery on every visit

const CURRENT_YEAR = new Date().getFullYear();
const TOP_TIERS = "OW,DF,GW,GL"; // Olympics/Worlds, Diamond League Final, world-level and continental championships

export default async function Home() {
  const topSince = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [races, topRaces, upcoming, progression] = await Promise.all([
    getLatestRaces(15, { tier: BASE_TIERS }), // B and above by default; the filter widens it
    // the latest big competitions (GL and above): a quiet week of
    // small meets must not bury them for a visitor who only wants the headline event
    getLatestRaces(12, { tier: TOP_TIERS, from: topSince }),
    getUpcomingHome(10),
    getEventYearlyProgression("100 Metres", "Men"),
  ]);

  // Top block = the 3 latest RACES of top competitions (regrouped under their competition);
  // the feed above shows the 3 latest competitions and skips these so nothing shows twice
  const latestTopRaces = topRaces
    .flatMap((g) => g.races.map((r) => ({ g, r })))
    .sort((a, b) => b.r.date.localeCompare(a.r.date))
    .slice(0, 3);
  const top = [...new Set(latestTopRaces.map((x) => x.g))].map((g) => ({
    ...g,
    races: latestTopRaces.filter((x) => x.g === g).map((x) => x.r),
  }));
  const topNames = new Set(top.map((g) => g.event_name));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-6">
        <h1 className="sr-only">Latest athletics results</h1>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px_320px] gap-10 lg:gap-6">
        {/* Latest results -- flexible column, never shrinks the fixed side columns */}
        <div className="min-w-0 flex flex-col gap-8">
          <LatestResults initialGroups={races} defaultTier={BASE_TIERS} maxGroups={3} exclude={[...topNames]} />
          {top.length > 0 && <LatestResults initialGroups={top} heading="Top competitions results" showFilters={false} />}
        </div>

        {/* Upcoming races, then a compact best-mark progression chart */}
        <div className="flex flex-col gap-10 lg:gap-6">
          <UpcomingRaces initial={upcoming} />
          <div className="hidden lg:block">
            <HomeProgressionWidget initial={progression} />
          </div>
        </div>

        {/* phones: the long stats widgets give way to four doors into the site */}
        <nav className="lg:hidden grid grid-cols-2 gap-3" aria-label="Explore">
          {[
            ["Rankings", "Top athletes by discipline", "/rankings"],
            ["Meets", "Competitions and races", "/meets"],
            ["Countries", "Nations and medals", "/countries"],
            ["Disciplines", "Records and best marks", "/disciplines"],
          ].map(([t, d, h]) => (
            <Link key={h} href={h} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4 hover:border-orange-500">
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block mt-0.5 text-xs text-neutral-500">{d}</span>
            </Link>
          ))}
        </nav>

        {/* Stats: by athlete, then by nation */}
        <aside className="hidden lg:flex flex-col gap-6">
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-2 px-2">
              Athletes
            </h2>
            <StatsWidget year={CURRENT_YEAR} />
          </section>

          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-2 px-2">
              Nations
            </h2>
            <NationsStatsWidget year={CURRENT_YEAR} />
          </section>

          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-2 px-2">
              Races
            </h2>
            <RacesStatsWidget year={CURRENT_YEAR} />
          </section>
        </aside>
        </div>
      </main>
    </div>
  );
}
