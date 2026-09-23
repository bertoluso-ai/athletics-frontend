import {
  getLatestResults,
  getUpcomingCompetitions,
  getYearRanking,
  getYearBestMarks,
} from "@/lib/queries";

export const revalidate = 3600; // 1h: no hace falta pegar a BigQuery en cada visita

const CURRENT_YEAR = new Date().getFullYear();

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export default async function Home() {
  const [latest, upcoming, ranking, marks] = await Promise.all([
    getLatestResults(14),
    getUpcomingCompetitions(10),
    getYearRanking(CURRENT_YEAR, 8),
    getYearBestMarks(CURRENT_YEAR, 1),
  ]);

  const rankingMen = ranking.filter((r) => r.gender === "Men");
  const rankingWomen = ranking.filter((r) => r.gender === "Women");
  const marksMen = marks.filter((m) => m.gender === "Men");
  const marksWomen = marks.filter((m) => m.gender === "Women");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">
          Athletics<span className="text-orange-500">DB</span>
        </h1>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Últimos resultados -- centro */}
        <section className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            Últimos resultados
          </h2>
          <div className="flex flex-col divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
            {latest.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 bg-neutral-900/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.display_name}</div>
                  <div className="text-xs text-neutral-400 truncate">
                    {r.athletics_event} · {r.event_name}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-sm text-orange-400">{r.mark_display}</span>
                  <span className="text-xs text-neutral-500 w-14 text-right">{formatDate(r.date)}</span>
                </div>
              </div>
            ))}
            {latest.length === 0 && (
              <div className="px-4 py-6 text-sm text-neutral-500">Sin resultados recientes.</div>
            )}
          </div>
        </section>

        {/* Calendario */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            Próximas carreras
          </h2>
          <div className="flex flex-col divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
            {upcoming.map((c, i) => (
              <div key={i} className="px-4 py-3 bg-neutral-900/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{c.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 shrink-0">
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
              <div className="px-4 py-6 text-sm text-neutral-500">Sin carreras próximas de alto nivel.</div>
            )}
          </div>
        </section>

        {/* Ranking del año */}
        <section className="lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            Ranking {CURRENT_YEAR}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Masculino", rows: rankingMen },
              { label: "Femenino", rows: rankingWomen },
            ].map((group) => (
              <div key={group.label} className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-neutral-900 text-xs font-semibold text-neutral-400">
                  {group.label}
                </div>
                <div className="divide-y divide-neutral-800">
                  {group.rows.map((r, i) => (
                    <div key={r.athlete_id} className="flex items-center justify-between px-4 py-2 bg-neutral-900/40">
                      <span className="text-sm">
                        <span className="text-neutral-500 mr-2">{i + 1}</span>
                        {r.display_name}
                      </span>
                      <span className="font-mono text-sm text-orange-400">{r.puntos_anio}</span>
                    </div>
                  ))}
                  {group.rows.length === 0 && (
                    <div className="px-4 py-4 text-sm text-neutral-500">Sin datos todavía.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Mejores marcas del año */}
        <section className="lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            Mejores marcas {CURRENT_YEAR}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Masculino", rows: marksMen },
              { label: "Femenino", rows: marksWomen },
            ].map((group) => (
              <div key={group.label} className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-neutral-900 text-xs font-semibold text-neutral-400">
                  {group.label}
                </div>
                <div className="divide-y divide-neutral-800">
                  {group.rows.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 bg-neutral-900/40">
                      <div>
                        <div className="text-sm">{m.display_name}</div>
                        <div className="text-xs text-neutral-500">{m.athletics_event}</div>
                      </div>
                      <span className="font-mono text-sm text-orange-400">{m.mark_display}</span>
                    </div>
                  ))}
                  {group.rows.length === 0 && (
                    <div className="px-4 py-4 text-sm text-neutral-500">Sin datos todavía.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
