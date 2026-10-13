import { getLatestRaces, getEventYearlyProgression } from "@/lib/queries";
import { getUpcomingHome } from "@/lib/calendar";
import StatsWidget from "@/components/StatsWidget";
import NationsStatsWidget from "@/components/NationsStatsWidget";
import RacesStatsWidget from "@/components/RacesStatsWidget";
import LatestResults from "@/components/LatestResults";
import UpcomingRaces from "@/components/UpcomingRaces";
import SectionBar from "@/components/SectionBar";
import HomeProgressionWidget from "@/components/HomeProgressionWidget";

export const revalidate = 3600; // 1h: no need to hit BigQuery on every visit

const CURRENT_YEAR = new Date().getFullYear();
const RECENT_TOP_DAYS = 7; // una top competition cuenta como "reciente" (va arriba) durante estos dias
const TOP_TIERS = "OW,DF,GW"; // Olympics/Worlds, Diamond League Final and world-level championships

export default async function Home() {
  const topSince = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [races, topRaces, upcoming, progression] = await Promise.all([
    getLatestRaces(60, {}), // all categories by default: the Quality+tier score ranks the feed, so strong low-tier races surface
    // the latest big competitions (GW and above): a quiet week of
    // small meets must not bury them for a visitor who only wants the headline event
    getLatestRaces(12, { tier: TOP_TIERS, from: topSince }),
    getUpcomingHome(10),
    getEventYearlyProgression("100 Metres", "Men"),
  ]);

  // Una competicion top (GW o superior) RECIENTE sube al principio del feed principal (mismo orden que el resto); cuando deja de ser
  // reciente baja al bloque "Top competitions results". Asi el feed conserva su orden y la top no queda enterrada la semana que se disputa.
  const recentCut = new Date(Date.now() - RECENT_TOP_DAYS * 86400000).toISOString().slice(0, 10);
  const latestDate = (g: (typeof topRaces)[number]) => g.races.reduce((m, r) => (r.date > m ? r.date : m), "");
  const recentTop = topRaces.filter((g) => latestDate(g) >= recentCut);
  const recentNames = new Set(recentTop.map((g) => g.event_name));
  const top = topRaces.filter((g) => !recentNames.has(g.event_name)).slice(0, 3);
  const topNames = new Set(top.map((g) => g.event_name));
  const feed = [...recentTop, ...races.filter((g) => !recentNames.has(g.event_name))];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">

      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <h1 className="sr-only">Latest athletics results</h1>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px_320px] gap-10 lg:gap-6">
        {/* Latest results -- flexible column, never shrinks the fixed side columns */}
        <div className="min-w-0 flex flex-col gap-8">
          <LatestResults initialGroups={feed} defaultTier="" maxGroups={3} exclude={[...topNames]} />
          {top.length > 0 && <LatestResults initialGroups={top} heading="Top competitions results" headingIcon="trophy" showFilters={false} />}
        </div>

        {/* Upcoming races, then a compact best-mark progression chart */}
        <div className="flex flex-col gap-10 lg:gap-6">
          <UpcomingRaces initial={upcoming} />
          <div className="hidden lg:block">
            <HomeProgressionWidget initial={progression} />
          </div>
        </div>

        {/* Stats: by athlete, then by nation */}
        <aside className="flex flex-col gap-10 lg:gap-6">
          <section>
            <SectionBar title="Athletes" icon="user" href="/rankings" linkLabel="Rankings →" />
            <StatsWidget year={CURRENT_YEAR} />
          </section>

          <section>
            <SectionBar title="Nations" icon="globe" href="/countries" linkLabel="Countries →" />
            <NationsStatsWidget year={CURRENT_YEAR} />
          </section>

          {/* desktop only: phones keep athletes and nations (top 5) */}
          <section className="hidden lg:block">
            <RacesStatsWidget year={CURRENT_YEAR} />
          </section>
        </aside>
        </div>
      </main>
    </div>
  );
}
