import { getLatestRaces, getUpcomingCompetitions } from "@/lib/queries";
import Header from "@/components/Header";
import StatsWidget from "@/components/StatsWidget";
import LatestResults from "@/components/LatestResults";
import UpcomingRaces from "@/components/UpcomingRaces";

export const revalidate = 3600; // 1h: no need to hit BigQuery on every visit

const CURRENT_YEAR = new Date().getFullYear();

export default async function Home() {
  const [races, upcoming] = await Promise.all([
    getLatestRaces(10),
    getUpcomingCompetitions(10),
  ]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />

      <main className="mx-auto max-w-6xl px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest results -- wide center column */}
        <div className="lg:col-span-2">
          <LatestResults initialRaces={races} />
        </div>

        {/* Sidebar: calendar + ranking/marks widget */}
        <aside className="flex flex-col gap-6">
          <UpcomingRaces initial={upcoming} />

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              Stats
            </h2>
            <StatsWidget year={CURRENT_YEAR} />
          </section>
        </aside>
      </main>
    </div>
  );
}
