import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import ResultsList from "@/components/ResultsList";
import WindBadge from "@/components/WindBadge";
import {
  getAthleteInfo,
  getAthleteEvents,
  getAthletePersonalBests,
  getAthleteYearlyPoints,
  getAthleteResultsForYear,
} from "@/lib/queries";
import { getAthletePhoto } from "@/lib/wikipedia";
import { eventLabel } from "@/lib/events";

export const revalidate = 3600;

export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; event?: string; wind?: string }>;
}) {
  const { id } = await params;
  const { year: yearParam, event: eventParam, wind: windParam } = await searchParams;
  const includeIllegalWind = windParam === "all";

  const info = await getAthleteInfo(id);
  if (!info) notFound();

  const [athleteEvents, personalBests, yearlyPoints, photo] = await Promise.all([
    getAthleteEvents(id),
    getAthletePersonalBests(id, includeIllegalWind),
    getAthleteYearlyPoints(id, info.gender ?? ""),
    getAthletePhoto(info.display_name),
  ]);

  // Default discipline: whichever has the athlete's most recent result overall
  // (not just the most-competed one -- that could easily be a discipline they
  // haven't raced in for a while, landing on a stale year by default).
  const mostRecentEvent = athleteEvents.reduce<typeof athleteEvents[number] | null>((best, ev) => {
    const evYear = ev.years[0] ?? -Infinity;
    const bestYear = best?.years[0] ?? -Infinity;
    if (evYear > bestYear) return ev;
    if (evYear === bestYear && ev.n_results > (best?.n_results ?? -Infinity)) return ev;
    return best;
  }, null);

  const event = eventParam ?? mostRecentEvent?.athletics_event ?? athleteEvents[0]?.athletics_event ?? "";
  const eventYears = athleteEvents.find((ev) => ev.athletics_event === event)?.years ?? [];
  const requestedYear = yearParam === "all" ? "all" : yearParam ? Number(yearParam) : null;
  const year: number | "all" =
    requestedYear === "all"
      ? "all"
      : requestedYear && eventYears.includes(requestedYear)
      ? requestedYear
      : eventYears[0] ?? info.last_year;

  // For the "Points by Year" sidebar: jump to a discipline that actually
  // has results in that year, instead of keeping whatever is selected now.
  function defaultEventForYear(y: number): string {
    return athleteEvents.find((ev) => ev.years.includes(y))?.athletics_event ?? event;
  }

  const results = event ? await getAthleteResultsForYear(id, year, event) : [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Hero */}
        <div className="flex items-center gap-4 mb-8">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={info.display_name}
              className="w-24 h-24 rounded-full object-cover shrink-0 border border-neutral-800"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-bold shrink-0">
              {info.display_name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flag code={info.nationality} className="w-6 h-4" />
              {info.display_name}
            </h1>
            <p className="text-sm text-neutral-400">
              {info.gender === "Men" ? "Men" : info.gender === "Women" ? "Women" : info.gender}
              {info.birth_year ? ` · b. ${info.birth_year}` : ""} · Active {info.first_year}–{info.last_year}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: single filterable results block */}
          <div className="lg:col-span-2">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
                Results
              </h2>
              <ResultsList
                results={results}
                event={event}
                gender={info.gender ?? ""}
                emptyLabel={`No results for ${eventLabel(event)}${year !== "all" ? ` in ${year}` : ""}.`}
                filterEvents={athleteEvents.map((ev) => ({
                  value: ev.athletics_event,
                  label: eventLabel(ev.athletics_event),
                  years: ev.years,
                }))}
                year={year}
                baseHref={`/athletes/${id}`}
              />
            </section>
          </div>

          {/* Right: personal bests + yearly points */}
          <aside className="flex flex-col gap-8">
            <section>
              <div className="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  Personal Bests
                </h2>
                <Link
                  href={`/athletes/${id}?${eventParam ? `event=${encodeURIComponent(eventParam)}&` : ""}${yearParam ? `year=${yearParam}&` : ""}wind=${includeIllegalWind ? "" : "all"}`}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 underline decoration-dotted"
                >
                  {includeIllegalWind ? "hide illegal wind" : "show illegal wind"}
                </Link>
              </div>
              <div className="text-[11px] text-neutral-500 mb-2">#N = all-time world rank</div>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                {personalBests.map((pb, i) => (
                  <Link
                    key={i}
                    href={`/rankings?event=${encodeURIComponent(pb.athletics_event)}&gender=${info.gender ?? ""}&year=all`}
                    className="flex items-center justify-between px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800"
                  >
                    <span className="text-sm">{eventLabel(pb.athletics_event)}</span>
                    <span className="font-mono text-sm text-orange-400 flex items-center gap-1.5">
                      <WindBadge wind={pb.wind} windLegal={pb.wind_legal} />
                      {pb.mark_display}
                      {pb.all_time_rank && (
                        <span
                          className="text-neutral-500 ml-1"
                          title={`All-time world rank: ${pb.all_time_rank}`}
                        >
                          (#{pb.all_time_rank})
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
                {personalBests.length === 0 && (
                  <div className="px-4 py-4 text-sm text-neutral-500">No marks recorded.</div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  Points by Year
                </h2>
                <span className="text-[11px] text-neutral-500">#N = rank that year</span>
              </div>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                {yearlyPoints.map((y) => (
                  <Link
                    key={y.year}
                    href={`/rankings?event=${encodeURIComponent(defaultEventForYear(y.year))}&gender=${info.gender ?? ""}&year=${y.year}`}
                    className={`flex items-center justify-between px-4 py-2 hover:bg-neutral-800 ${
                      y.year === year ? "bg-neutral-800" : "bg-neutral-900/40"
                    }`}
                  >
                    <span className="text-sm">{y.year}</span>
                    <span className="font-mono text-sm text-orange-400">
                      {y.points}
                      {y.rank && (
                        <span
                          className="text-neutral-500 ml-1"
                          title={`Rank in ${y.year} by total points (same gender): ${y.rank}`}
                        >
                          (#{y.rank})
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
