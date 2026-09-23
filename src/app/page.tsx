import { getLatestRaces, getUpcomingCompetitions } from "@/lib/queries";
import Header from "@/components/Header";
import StatsWidget from "@/components/StatsWidget";
import LatestResults from "@/components/LatestResults";
import Flag from "@/components/Flag";

export const revalidate = 3600; // 1h: no need to hit BigQuery on every visit

const CURRENT_YEAR = new Date().getFullYear();

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

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
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              Upcoming Races
            </h2>
            <div className="flex flex-col divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
              {upcoming.map((c, i) => (
                <div key={i} className="px-4 py-3 bg-neutral-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex items-center gap-1.5">
                      <Flag code={c.country} />
                      {c.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400 shrink-0">
                      {c.category}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 truncate">
                    {formatDate(c.date_start)}
                    {c.date_end !== c.date_start ? `–${formatDate(c.date_end)}` : ""} · {c.venue}
                  </div>
                </div>
              ))}
              {upcoming.length === 0 && (
                <div className="px-4 py-6 text-sm text-neutral-500">No major upcoming races.</div>
              )}
            </div>
          </section>

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
