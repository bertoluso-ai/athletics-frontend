import { getLatestRaces, getUpcomingCompetitions, getEventYearlyProgression } from "@/lib/queries";
import Header from "@/components/Header";
import StatsWidget from "@/components/StatsWidget";
import NationsStatsWidget from "@/components/NationsStatsWidget";
import RacesStatsWidget from "@/components/RacesStatsWidget";
import LatestResults from "@/components/LatestResults";
import UpcomingRaces from "@/components/UpcomingRaces";
import HomeProgressionWidget from "@/components/HomeProgressionWidget";

export const revalidate = 3600; // 1h: no need to hit BigQuery on every visit

const CURRENT_YEAR = new Date().getFullYear();

export default async function Home() {
  const [races, upcoming, progression] = await Promise.all([
    getLatestRaces(15), // enough race-slots for >=5 competitions, capped at 3 races each
    getUpcomingCompetitions(10),
    getEventYearlyProgression("100 Metres", "Men"),
  ]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />

      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Home</h1>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px_320px] gap-6">
        {/* Latest results -- flexible column, never shrinks the fixed side columns */}
        <div className="min-w-0">
          <LatestResults initialGroups={races} />
        </div>

        {/* Upcoming races, then a compact best-mark progression chart */}
        <div className="flex flex-col gap-6">
          <UpcomingRaces initial={upcoming} />
          <HomeProgressionWidget initial={progression} />
        </div>

        {/* Stats: by athlete, then by nation */}
        <aside className="flex flex-col gap-6">
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
