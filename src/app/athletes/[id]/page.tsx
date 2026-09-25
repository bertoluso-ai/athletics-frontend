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
  getAthleteChampionships,
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

  const [athleteEvents, bestResults, personalBests, yearlyPoints, photo, championships] = await Promise.all([
    getAthleteEvents(id),
    getAthleteBestResults(id, 5),
    getAthletePersonalBests(id, includeIllegalWind, indoor),
    getAthleteYearlyPoints(id, info.gender ?? ""),
    getAthletePhoto(info.display_name),
    getAthleteChampionships(id),
  ]);

  // Default: every discipline, most recent year -- the full picture of the
  // athlete's latest season, not just one event.
  const event = eventParam ?? "all";
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

  const totalWins = yearlyPoints.reduce((n, y) => n + y.wins, 0);
  const bestSeasonRank = yearlyPoints.reduce<number | null>(
    (best, y) => (y.rank && (best === null || y.rank < best) ? y.rank : best),
    null
  );
  const maxPoints = Math.max(1, ...yearlyPoints.map((y) => y.points ?? 0));

  // Desktop follows the ProCyclingStats athlete page: a top band of three
  // columns (info | top results | key stats + seasons), then the results
  // table across the first two columns while the right column carries on
  // underneath (personal bests). On phones: one column in reading order.
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl lg:text-3xl font-bold mb-5 flex items-center justify-center lg:justify-start gap-3">
          <Flag code={info.nationality} className="w-7 h-5 hidden lg:inline-block" />
          {info.display_name}
          <Link
            href={`/h2h?a=${id}`}
            className="ml-auto lg:ml-3 text-xs font-semibold px-2.5 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-orange-500 hover:text-orange-400"
            title="Head-to-head: compare with another athlete"
          >
            H2H
          </Link>
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_20rem] lg:grid-rows-[auto_1fr] gap-x-8 gap-y-8 items-start">
          {/* Info */}
          <section className="lg:col-start-1 lg:row-start-1">
            <h2 className="hidden lg:block text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Info</h2>
            <div className="flex items-start gap-4">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={info.display_name}
                  className="w-20 h-20 rounded-full lg:w-32 lg:h-40 lg:rounded-md object-cover shrink-0 border border-neutral-800"
                />
              ) : (
                <div className="w-20 h-20 rounded-full lg:w-32 lg:h-40 lg:rounded-md bg-neutral-800 flex items-center justify-center text-3xl font-bold shrink-0">
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
                {/* Olympic / World Championships record */}
                {championships.length > 0 && (
                  <div className="pt-2 flex flex-col gap-2">
                    {championships.map((c) => (
                      <div key={c.kind} className="flex items-start gap-2">
                        <span className="w-6 shrink-0 flex justify-center pt-0.5" aria-hidden="true">
                          {c.kind === "olympics" ? <OlympicRings /> : <span className="text-base leading-none">🌍</span>}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-semibold text-neutral-100">
                              {c.kind === "olympics" ? "Olympian" : "World Championships"}
                            </span>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                              ×{c.editions.length}
                            </span>
                            {c.gold + c.silver + c.bronze > 0 && (
                              <span className="text-xs text-neutral-300 whitespace-nowrap">
                                {c.gold > 0 && <span className="mr-1.5">🥇{c.gold}</span>}
                                {c.silver > 0 && <span className="mr-1.5">🥈{c.silver}</span>}
                                {c.bronze > 0 && <span>🥉{c.bronze}</span>}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {c.editions.map((e, j) => (
                              <span key={e.year}>
                                {j > 0 && " · "}
                                <Link
                                  href={`/meets/${encodeURIComponent(e.event_name)}?year=${e.year}`}
                                  className="hover:text-orange-400"
                                >
                                  {e.year}
                                </Link>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </dl>
            </div>
          </section>

          {/* Top results */}
          {bestResults.length > 0 && (
            <section className="lg:col-start-2 lg:row-start-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Top Results</h2>
              <div className="flex flex-col gap-1">
                {bestResults.map((r, i) => {
                  const meetHref = (eventName: string, y: number) =>
                    `/meets/${encodeURIComponent(eventName)}?year=${y}&discipline=${encodeURIComponent(r.athletics_event)}&gender=${r.gender}`;
                  return (
                    <div key={i} className="text-sm" title={`${r.n}x ${["gold", "silver", "bronze"][r.place - 1]}`}>
                      <span className="text-neutral-500">{r.n}x </span>
                      <span className="mr-1">{MEDAL[r.place - 1]}</span>
                      <Link href={meetHref(r.editions[0].event_name, r.editions[0].year)} className="font-medium hover:text-orange-400">
                        {r.series_name}
                      </Link>{" "}
                      <span className="text-neutral-400">{eventLabel(r.athletics_event)}</span>{" "}
                      {/* each year opens that year's edition */}
                      <span className="text-neutral-500">
                        (
                        {r.editions.map((e, j) => (
                          <span key={e.year}>
                            {j > 0 && ", "}
                            <Link href={meetHref(e.event_name, e.year)} className="hover:text-orange-400 hover:underline">
                              &apos;{String(e.year).slice(2)}
                            </Link>
                          </span>
                        ))}
                        )
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Right column: key stats, seasons, personal bests */}
          <aside className="flex flex-col gap-8 lg:col-start-3 lg:row-start-1 lg:row-span-2 order-last lg:order-none">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Key Stats</h2>
              <div className="flex flex-col gap-1.5 text-sm">
                {[
                  { n: totalWins, label: "Wins" },
                  { n: yearlyPoints.length, label: "Seasons" },
                  { n: bestSeasonRank ? `#${bestSeasonRank}` : "—", label: "Best season rank" },
                ].map((k) => (
                  <div key={k.label} className="flex items-center gap-2">
                    <span className="min-w-[2.75rem] text-center font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500 text-black">
                      {k.n}
                    </span>
                    <span className="text-neutral-300">{k.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Stats by Year</h2>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                <div className="grid grid-cols-[2.75rem_1fr_2.75rem_3.5rem] gap-x-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  <span />
                  <span>Points</span>
                  <span className="text-right">Wins</span>
                  <span className="text-right" title="Rank that year by total points (same gender)">#</span>
                </div>
                {yearlyPoints.map((y) => (
                  <Link
                    key={y.year}
                    href={`/rankings?event=all&gender=${info.gender ?? ""}&year=${y.year}`}
                    className={`grid grid-cols-[2.75rem_1fr_2.75rem_3.5rem] items-center gap-x-1.5 px-3 py-1.5 hover:bg-neutral-800 ${
                      y.year === year ? "bg-neutral-800" : "bg-neutral-900/40"
                    }`}
                  >
                    <span className="text-sm">{y.year}</span>
                    {/* PCS-style bar, scaled to the athlete's best season */}
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-3 rounded-sm bg-orange-500/80 shrink-0"
                        style={{ width: `${Math.max(2, ((y.points ?? 0) / maxPoints) * 70)}%` }}
                      />
                      <span className="font-mono text-xs text-orange-400 tabular-nums">{y.points}</span>
                    </span>
                    <span
                      className="text-xs text-right tabular-nums whitespace-nowrap"
                      title={y.wins > 0 ? `${y.wins} win${y.wins > 1 ? "s" : ""} in ${y.year}` : undefined}
                    >
                      {y.wins > 0 ? `🥇 ${y.wins}` : ""}
                    </span>
                    <span
                      className="font-mono text-sm text-neutral-400 text-right tabular-nums"
                      title={y.rank ? `Rank in ${y.year} by total points (same gender): ${y.rank}` : undefined}
                    >
                      {y.rank ?? ""}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  Personal Bests
                </h2>
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
                <div className="grid grid-cols-[1fr_auto_4.75rem_4.5rem] gap-x-1.5 px-4 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  <span />
                  <span />
                  <span className="text-right">Mark</span>
                  <span className="text-right" title="All-time world rank">#</span>
                </div>
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

          </aside>

          {/* Results */}
          <section className="lg:col-start-1 lg:col-span-2 lg:row-start-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Results</h2>
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
      </main>
    </div>
  );
}

function OlympicRings() {
  // five rings, official colours; small enough to sit beside a text line
  const rings = [
    { cx: 5, cy: 5, c: "#0081C8" },
    { cx: 12, cy: 5, c: "#E5E5E5" },
    { cx: 19, cy: 5, c: "#EE334E" },
    { cx: 8.5, cy: 8.5, c: "#FCB131" },
    { cx: 15.5, cy: 8.5, c: "#00A651" },
  ];
  return (
    <svg viewBox="0 0 24 14" className="w-6 h-3.5">
      {rings.map((r) => (
        <circle key={r.c} cx={r.cx} cy={r.cy} r="3.3" fill="none" stroke={r.c} strokeWidth="1.2" />
      ))}
    </svg>
  );
}
