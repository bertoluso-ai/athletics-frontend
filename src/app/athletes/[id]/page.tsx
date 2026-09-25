import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import ResultsList from "@/components/ResultsList";
import WindBadge from "@/components/WindBadge";
import {
  getAthleteInfo,
  getAthleteEvents,
  getAthleteBestResults,
  getAthletePersonalBests,
  getAthleteYearlyPoints,
  getAthleteResultsForYear,
} from "@/lib/queries";
import { getAthletePhoto } from "@/lib/wikipedia";
import { eventCategory, eventLabel } from "@/lib/events";

export const revalidate = 3600;

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; event?: string; wind?: string; category?: string; indoor?: string }>;
}) {
  const { id } = await params;
  const { year: yearParam, event: eventParam, wind: windParam, category: categoryParam, indoor: indoorParam } = await searchParams;
  const includeIllegalWind = windParam === "all";
  const indoor = indoorParam === "true";

  const info = await getAthleteInfo(id);
  if (!info) notFound();

  const [athleteEvents, bestResults, personalBests, yearlyPoints, photo] = await Promise.all([
    getAthleteEvents(id),
    getAthleteBestResults(id, 5),
    getAthletePersonalBests(id, includeIllegalWind, indoor),
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
  const allDisciplineYears = Array.from(new Set(athleteEvents.flatMap((ev) => ev.years))).sort((a, b) => b - a);
  const eventYears =
    event === "all" ? allDisciplineYears : athleteEvents.find((ev) => ev.athletics_event === event)?.years ?? [];
  const requestedYear = yearParam === "all" ? "all" : yearParam ? Number(yearParam) : null;
  const year: number | "all" =
    requestedYear === "all"
      ? "all"
      : requestedYear && eventYears.includes(requestedYear)
      ? requestedYear
      : eventYears[0] ?? info.last_year;

  const results = event ? await getAthleteResultsForYear(id, year, event) : [];

  // Personal Bests: filter by broad category (Track/Road/Cross Country/...)
  // so road and track marks over similar distances (10km vs 10,000m) don't
  // get conflated -- only offered when the athlete actually spans more than one.
  const availableCategories = Array.from(new Set(personalBests.map((pb) => eventCategory(pb.athletics_event))));
  const category = categoryParam && availableCategories.includes(categoryParam) ? categoryParam : "";
  const filteredPersonalBests = category
    ? personalBests.filter((pb) => eventCategory(pb.athletics_event) === category)
    : personalBests;
  function pbHref(overrides: { category?: string; wind?: boolean; indoor?: boolean }): string {
    const qs = new URLSearchParams();
    if (eventParam) qs.set("event", eventParam);
    if (yearParam) qs.set("year", yearParam);
    const nextCategory = overrides.category !== undefined ? overrides.category : category;
    if (nextCategory) qs.set("category", nextCategory);
    const nextWind = overrides.wind !== undefined ? overrides.wind : includeIllegalWind;
    if (nextWind) qs.set("wind", "all");
    const nextIndoor = overrides.indoor !== undefined ? overrides.indoor : indoor;
    if (nextIndoor) qs.set("indoor", "true");
    const qsString = qs.toString();
    return `/athletes/${id}${qsString ? `?${qsString}` : ""}`;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-3 text-center">{info.display_name}</h1>
          <div className="flex items-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={info.display_name}
                className="w-20 h-20 rounded-full object-cover shrink-0 border border-neutral-800"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-bold shrink-0">
                {info.display_name.charAt(0)}
              </div>
            )}
            <dl className="text-sm space-y-1">
              <div className="flex gap-2">
                <dt className="text-neutral-500 w-20 shrink-0">Nationality</dt>
                <dd className="flex items-center gap-1.5 text-neutral-300">
                  <Flag code={info.nationality} className="w-4 h-3" />
                  {info.nationality ?? "—"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-neutral-500 w-20 shrink-0">Gender</dt>
                <dd className="text-neutral-300">
                  {info.gender === "Men" ? "Men" : info.gender === "Women" ? "Women" : info.gender ?? "—"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-neutral-500 w-20 shrink-0">Born</dt>
                <dd className="text-neutral-300">{info.birth_year ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-neutral-500 w-20 shrink-0">Active</dt>
                <dd className="text-neutral-300">{info.first_year}–{info.last_year}</dd>
              </div>
            </dl>
          </div>
        </div>

        {bestResults.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              Top Results
            </h2>
            <div className="flex flex-col gap-1">
              {bestResults.map((r, i) => (
                <Link
                  key={i}
                  href={`/meets/${encodeURIComponent(r.event_name)}?year=${r.years[0]}&discipline=${encodeURIComponent(r.athletics_event)}&gender=${r.gender}`}
                  title={`${r.n}x ${["gold", "silver", "bronze"][r.place - 1]}`}
                  className="text-sm hover:text-orange-400"
                >
                  <span className="text-neutral-500">{r.n}x </span>
                  <span className="mr-1">{MEDAL[r.place - 1]}</span>
                  <span className="font-medium">{r.series_name}</span>
                  {" "}
                  <span className="text-neutral-400">{eventLabel(r.athletics_event)}</span>
                  {" "}
                  <span className="text-neutral-500">({r.years.map((y) => `'${String(y).slice(2)}`).join(", ")})</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left: single filterable results block */}
          <div className="lg:col-span-3">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
                By Year
              </h2>
              <ResultsList
                results={results}
                event={event}
                gender={info.gender ?? ""}
                emptyLabel={`No results for ${event === "all" ? "any discipline" : eventLabel(event)}${year !== "all" ? ` in ${year}` : ""}.`}
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
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  Personal Bests
                </h2>
                <span className="text-[11px] text-neutral-500">#N = all-time world rank</span>
              </div>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                {availableCategories.length > 1 ? (
                  <div className="pill-row flex flex-nowrap overflow-x-auto gap-1">
                    {["", ...availableCategories].map((c) => (
                      <Link
                        key={c || "all"}
                        href={pbHref({ category: c })}
                        scroll={false}
                        className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
                          category === c
                            ? "bg-neutral-100 text-black border-neutral-100"
                            : "border-neutral-700 text-neutral-400"
                        }`}
                      >
                        {c || "All"}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={pbHref({ wind: !includeIllegalWind })}
                    scroll={false}
                    title="Wind-illegal marks are excluded from Personal Bests unless there's no legal one -- turn this on to show them too"
                    className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${
                      includeIllegalWind
                        ? "bg-red-500/20 border-red-500/40 text-red-400"
                        : "border-neutral-700 text-neutral-400"
                    }`}
                  >
                    {includeIllegalWind ? "Wind: shown" : "Wind: hidden"}
                  </Link>
                  <Link
                    href={pbHref({ indoor: !indoor })}
                    scroll={false}
                    title="Indoor and outdoor marks are separate ranking contexts in the sport (separate world records exist) -- never blended together here"
                    className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${
                      indoor
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                        : "border-neutral-700 text-neutral-400"
                    }`}
                  >
                    {indoor ? "Indoor" : "Outdoor"}
                  </Link>
                </div>
              </div>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                {filteredPersonalBests.map((pb, i) => (
                  <Link
                    key={i}
                    href={`/rankings?event=${encodeURIComponent(pb.athletics_event)}&gender=${info.gender ?? ""}&year=all`}
                    className="grid grid-cols-[1fr_auto_4.75rem_4.5rem] items-center gap-x-1.5 px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800"
                  >
                    {/* fixed columns so marks and ranks line up row to row */}
                    <span className="text-sm min-w-0 truncate">{eventLabel(pb.athletics_event)}</span>
                    {/* wrapper keeps the grid cell even when WindBadge renders nothing */}
                    <span><WindBadge wind={pb.wind} windLegal={pb.wind_legal} /></span>
                    <span className="font-mono text-sm text-orange-400 text-right tabular-nums">{pb.mark_display}</span>
                    <span
                      className="font-mono text-sm text-neutral-500 text-right tabular-nums"
                      title={pb.all_time_rank ? `All-time world rank: ${pb.all_time_rank}` : undefined}
                    >
                      {pb.all_time_rank ? `(#${pb.all_time_rank})` : ""}
                    </span>
                  </Link>
                ))}
                {filteredPersonalBests.length === 0 && (
                  <div className="px-4 py-4 text-sm text-neutral-500">No marks recorded.</div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  Stats by Year
                </h2>
                <span className="text-[11px] text-neutral-500">#N = rank that year</span>
              </div>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                {yearlyPoints.map((y) => (
                  <Link
                    key={y.year}
                    href={`/rankings?event=all&gender=${info.gender ?? ""}&year=${y.year}`}
                    className={`grid grid-cols-[1fr_3rem_4.75rem_4.5rem] items-center gap-x-1.5 px-4 py-2 hover:bg-neutral-800 ${
                      y.year === year ? "bg-neutral-800" : "bg-neutral-900/40"
                    }`}
                  >
                    {/* same column widths as Personal Bests above, so both
                        panels' numbers sit on the same vertical lines */}
                    <span className="text-sm">{y.year}</span>
                    <span
                      className="text-xs text-right tabular-nums whitespace-nowrap"
                      title={y.wins > 0 ? `${y.wins} win${y.wins > 1 ? "s" : ""} in ${y.year}` : undefined}
                    >
                      {y.wins > 0 ? `🥇 ${y.wins}` : ""}
                    </span>
                    <span className="font-mono text-sm text-orange-400 text-right tabular-nums">{y.points}</span>
                    <span
                      className="font-mono text-sm text-neutral-500 text-right tabular-nums"
                      title={y.rank ? `Rank in ${y.year} by total points (same gender): ${y.rank}` : undefined}
                    >
                      {y.rank ? `(#${y.rank})` : ""}
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
