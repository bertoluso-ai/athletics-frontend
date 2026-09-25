import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import YearSelect from "@/components/YearSelect";
import ViewAllList from "@/components/ViewAllList";
import { flagUrlWide } from "@/lib/flags";
import { eventLabel, TIER_LABELS } from "@/lib/events";
import { getAthletePhotoInfo, photoCredit } from "@/lib/wikipedia";
import PhotoCreditsToast from "@/components/PhotoCreditsToast";
import {
  COUNTED_ATHLETES,
  getCountryDetail,
  getCountryName,
  getCountryRanking,
  getCountryYears,
  parseCountryFilters,
  tierForRank,
  type CountryFilters,
  type CountryResultRow,
} from "@/lib/countries";

export const revalidate = 3600;

// Country page, after the ProCyclingStats team page: header with the key
// numbers, a photo wall of the athletes who score for the country, the
// full squad (sortable), latest wins and best results, and the country's
// rank season by season.

type SortKey = "points" | "name" | "age";
// natural first direction per column; clicking the active one flips it
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = { points: "desc", name: "asc", age: "asc" };

function qs(year: number, f: CountryFilters, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ year: String(year), gender: f.gender, ...extra });
  if (f.age) q.set("age", f.age);
  return q.toString();
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span
      title={TIER_LABELS.find((t) => t.value === tier)?.label ?? tier}
      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400"
    >
      {tier}
    </span>
  );
}

export default async function CountryPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ year?: string; gender?: string; age?: string; sort?: string; dir?: string; list?: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const sp = await searchParams;
  const years = await getCountryYears();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const f = parseCountryFilters(sp);
  const sort: SortKey = sp.sort === "name" || sp.sort === "age" ? sp.sort : "points";
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : DEFAULT_DIR[sort];
  const list: "wins" | "top" = sp.list === "top" ? "top" : "wins";
  const sortHref = (k: SortKey) => {
    const nextDir = sort === k ? (dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[k];
    return `/countries/${code}?${qs(year, f, { sort: k, dir: nextDir, list })}`;
  };
  const arrow = (k: SortKey) => (sort === k ? (dir === "asc" ? " ▲" : " ▼") : "");

  const [name, ranking, detail] = await Promise.all([
    getCountryName(code),
    getCountryRanking(year, f),
    getCountryDetail(code, year, f),
  ]);
  const me = ranking.find((r) => r.code === code);
  const tier = me ? tierForRank(me.rank) : null;
  const { athletes, lastWins, topResults, seasons, owMedals } = detail;
  const bestRankEver = seasons.length ? Math.min(...seasons.map((x) => x.rank)) : null;
  const goldSeasons = seasons.filter((x) => x.rank <= 8).length;

  const scoring = athletes.filter((a) => a.counts);
  // three lookups at a time: Wikimedia throttles bursts
  const photos: Awaited<ReturnType<typeof getAthletePhotoInfo>>[] = [];
  const wall = scoring.slice(0, 12);
  for (let i = 0; i < wall.length; i += 3) {
    photos.push(...(await Promise.all(wall.slice(i, i + 3).map((a) => getAthletePhotoInfo(a.display_name, a.birth_year)))));
  }

  const squad = [...athletes].sort((a, b) => {
    // ascending comparison, flipped for desc; unknown ages always last
    let c: number;
    if (sort === "name") c = a.display_name.localeCompare(b.display_name);
    else if (sort === "age") {
      if (a.birth_year === null || b.birth_year === null) return a.birth_year === null ? 1 : -1;
      c = b.birth_year - a.birth_year; // younger = lower age first
    } else c = a.points - b.points;
    return dir === "asc" ? c : -c;
  });
  const maxSeasonPoints = Math.max(1, ...seasons.map((s) => s.points));
  const idx = years.indexOf(year);
  const prevYear = years[idx + 1];
  const nextYear = years[idx - 1];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <Link href={`/countries?${qs(year, f)}`} className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Countries
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mt-1 mb-3">
          <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
            <Flag code={code} className="w-7 h-5" />
            {name}
          </h1>
          <span className="text-2xl lg:text-3xl font-bold text-orange-500">» {year}</span>
          <span className="flex items-center gap-1 ml-auto text-xs">
            {prevYear && (
              <Link href={`/countries/${code}?${qs(prevYear, f)}`} className="px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200">
                ← {prevYear}
              </Link>
            )}
            <YearSelect
              years={years}
              year={year}
              baseHref={`/countries/${code}?${new URLSearchParams({ gender: f.gender, ...(f.age ? { age: f.age } : {}), ...(sort !== "points" ? { sort } : {}) }).toString()}`}
            />
            {nextYear && (
              <Link href={`/countries/${code}?${qs(nextYear, f)}`} className="px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200">
                {nextYear} →
              </Link>
            )}
          </span>
        </div>

        {/* Gender / category: segmented controls across the full width */}
        <div className="grid grid-cols-[2fr_4fr] sm:grid-cols-[12rem_20rem] gap-2 mb-4 text-xs">
          <div className="flex rounded bg-neutral-800 p-0.5">
            {(["Men", "Women"] as const).map((g) => (
              <Link
                key={g}
                href={`/countries/${code}?${qs(year, { ...f, gender: g })}`}
                className={`flex-1 text-center py-1.5 rounded ${f.gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {g}
              </Link>
            ))}
          </div>
          <div className="flex rounded bg-neutral-800 p-0.5">
            {(["", "U23", "U20", "U18"] as const).map((a) => (
              <Link
                key={a || "all"}
                href={`/countries/${code}?${qs(year, { ...f, age: a || undefined })}`}
                className={`flex-1 text-center py-1.5 rounded whitespace-nowrap ${
                  (f.age ?? "") === a ? "bg-neutral-100 text-black font-semibold" : "text-neutral-400"
                }`}
              >
                {a || "All"}
              </Link>
            ))}
          </div>
        </div>

        {/* Top band, same structure as the athlete page: info (flag as the
            picture) | best results of the season | key stats */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem] gap-x-8 gap-y-6 mb-8 lg:[&>section]:self-stretch">
          <section>
            <h2 className="hidden lg:block text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Info</h2>
            <div className="flex items-stretch gap-4">
              {/* the flag fills the bio's height (object-cover), never taller */}
              <div className="flex flex-col gap-1.5 shrink-0 w-28 lg:w-40">
                <div className="relative flex-1 min-h-16 rounded-md overflow-hidden border border-neutral-800 bg-neutral-800">
                  {flagUrlWide(code, 320) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={flagUrlWide(code, 320)!} alt={name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-bold">{code}</span>
                  )}
                </div>
                {tier && (
                  <span className={`lg:hidden self-center text-xs font-semibold px-2 py-0.5 rounded border ${tier.border} ${tier.color}`}>
                    {tier.label}
                  </span>
                )}
              </div>
              <dl className="text-sm space-y-1">
                {[
                  { k: "Level", v: tier ? <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${tier.border} ${tier.color}`}>{tier.label}</span> : "—", desktopOnly: true },
                  { k: "Rank", v: me ? `#${me.rank}` : "—" },
                  { k: "Points", v: me?.points ?? 0 },
                  { k: "Scoring", v: `${scoring.length}/${COUNTED_ATHLETES}` },
                  { k: "Athletes", v: athletes.length },
                ].map((row: { k: string; v: React.ReactNode; desktopOnly?: boolean }) => (
                  <div key={row.k} className={`${row.desktopOnly ? "hidden lg:flex" : "flex"} gap-2`}>
                    <dt className="text-neutral-500 w-16 shrink-0">{row.k}</dt>
                    <dd className="text-neutral-300">{row.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Top Results</h2>
              {topResults.length > 7 && (
                <a href={`/countries/${code}?${qs(year, f, { list: "top", sort, dir })}#results`} className="text-xs text-orange-400 hover:underline">
                  View all →
                </a>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {topResults.slice(0, 7).map((r, i) => (
                <div key={i} className="text-sm truncate">
                  <span className="mr-1">{["🥇", "🥈", "🥉"][r.place - 1] ?? <span className="text-neutral-500 text-xs">{r.place}th</span>}</span>
                  <Link
                    href={`/meets/${encodeURIComponent(r.event_name)}?year=${r.year}&discipline=${encodeURIComponent(r.athletics_event)}`}
                    className="font-medium hover:text-orange-400"
                  >
                    {r.event_name}
                  </Link>{" "}
                  <span className="text-neutral-400">{eventLabel(r.athletics_event)}</span>{" "}
                  <Link href={`/athletes/${r.athlete_id}`} className="text-neutral-500 hover:text-orange-400">
                    {r.display_name}
                  </Link>
                </div>
              ))}
              {topResults.length === 0 && <span className="text-sm text-neutral-500">No results this season.</span>}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Key Stats</h2>
            <div className="flex flex-col gap-1.5 text-sm">
              {[
                { n: me?.wins ?? 0, label: "Wins" },
                { n: me?.podiums ?? 0, label: "Podiums" },
                { n: owMedals.olympic, label: "Olympic medals", title: "All-time, this gender" },
                { n: owMedals.worlds, label: "World Championships medals", title: "All-time, this gender" },
                { n: bestRankEver ? `#${bestRankEver}` : "—", label: "Best rank ever" },
                { n: goldSeasons, label: "Seasons in Gold" },
              ].map((k) => (
                <div key={k.label} className="flex items-center gap-2" title={k.title}>
                  <span className="min-w-[2.75rem] text-center font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500 text-black">
                    {k.n}
                  </span>
                  <span className="text-neutral-300">{k.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-8 items-start">
          <div className="flex flex-col gap-8 min-w-0">
            {/* Photo wall of the scoring athletes */}
            {scoring.length > 0 && (
              <section className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {scoring.slice(0, 12).map((a, i) => (
                  <Link
                    key={a.athlete_id}
                    href={`/athletes/${a.athlete_id}`}
                    title={`${a.display_name} — ${a.points} pts${photos[i] ? `
${photoCredit(photos[i]!)}` : ""}`}
                    className="group relative aspect-[3/4] rounded-md overflow-hidden bg-neutral-800 border border-neutral-800"
                  >
                    {photos[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photos[i]!.url} alt={a.display_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-2xl font-bold text-neutral-500">
                        {a.display_name.charAt(0)}
                      </span>
                    )}
                    <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pt-4 pb-1 text-[10px] leading-tight">
                      {a.display_name}
                    </span>
                  </Link>
                ))}
              </section>
            )}

            {/* Latest wins / Top results in one table with a switcher; the
                "View all" of Top Results lands here */}
            <section id="results" className="scroll-mt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
                  {([
                    { key: "wins", label: `Latest wins${me?.wins ? ` (${me.wins})` : ""}` },
                    { key: "top", label: "Top results" },
                  ] as const).map((t) => (
                    <a
                      key={t.key}
                      href={`/countries/${code}?${qs(year, f, { list: t.key, sort, dir })}#results`}
                      className={`px-3 py-1.5 rounded ${list === t.key ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                    >
                      {t.label}
                    </a>
                  ))}
                </div>
                {list === "wins" && (me?.wins ?? 0) > lastWins.length && (
                  <span className="text-[11px] text-neutral-500">latest {lastWins.length} of {me!.wins}</span>
                )}
              </div>
              <ResultsTable rows={list === "wins" ? lastWins : topResults} showPoints={list === "top"} />
            </section>
          </div>

          {/* Right column: squad + seasons */}
          <aside className="flex flex-col gap-8">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Squad</h2>
              <ViewAllList
                noun="athletes"
                initial={12}
                scrollOnMobile
                header={
                  <div className="grid grid-cols-[1.75rem_1fr_2rem_3rem] gap-x-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wide">
                  <span className="text-neutral-500">#</span>
                  <Link href={sortHref("name")} scroll={false} className={sort === "name" ? "text-orange-400" : "text-neutral-500 hover:text-neutral-300"}>
                    Name{arrow("name")}
                  </Link>
                  <Link href={sortHref("age")} scroll={false} className={`text-right ${sort === "age" ? "text-orange-400" : "text-neutral-500 hover:text-neutral-300"}`}>
                    Age{arrow("age")}
                  </Link>
                  <Link href={sortHref("points")} scroll={false} className={`text-right ${sort === "points" ? "text-orange-400" : "text-neutral-500 hover:text-neutral-300"}`}>
                    Pts{arrow("points")}
                  </Link>
                </div>
                }
                items={squad.slice(0, 500).map((a) => (
                  <Link
                    key={a.athlete_id}
                    href={`/athletes/${a.athlete_id}`}
                    className="grid grid-cols-[1.75rem_1fr_2rem_3rem] items-center gap-x-1.5 px-3 py-1.5 text-sm bg-neutral-900/40 hover:bg-neutral-800"
                    title={a.counts ? `Scores for ${name} (#${a.rn_in_country} in the country)` : `#${a.rn_in_country} in the country, outside the best ${COUNTED_ATHLETES}`}
                  >
                    <span className={`text-xs tabular-nums ${a.counts ? "text-orange-400" : "text-neutral-600"}`}>{a.rn_in_country}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{a.display_name}</span>
                      <span className="block text-[11px] text-neutral-500 truncate">{eventLabel(a.main_event)}</span>
                    </span>
                    <span className="text-xs text-neutral-500 text-right tabular-nums">
                      {a.birth_year ? year - a.birth_year : ""}
                    </span>
                    <span className={`font-mono text-xs text-right tabular-nums ${a.counts ? "text-orange-400" : "text-neutral-500"}`}>
                      {a.points}
                    </span>
                  </Link>
                ))}
              />
              {squad.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No athletes with points.</div>}
              <p className="text-[11px] text-neutral-500 mt-1">
                Orange = one of the {COUNTED_ATHLETES} athletes whose points count for the country.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Seasons</h2>
              <ViewAllList
                noun="seasons"
                initial={10}
                header={
                <div className="grid grid-cols-[2.75rem_1fr_3rem] gap-x-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  <span />
                  <span>Points</span>
                  <span className="text-right">#</span>
                </div>
                }
                items={seasons.map((s) => {
                  const t = tierForRank(s.rank);
                  return (
                    <Link
                      key={s.year}
                      href={`/countries/${code}?${qs(s.year, f)}`}
                      className={`grid grid-cols-[2.75rem_1fr_3rem] items-center gap-x-1.5 px-3 py-1.5 hover:bg-neutral-800 ${
                        s.year === year ? "bg-neutral-800" : "bg-neutral-900/40"
                      }`}
                    >
                      <span className="text-sm">{s.year}</span>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="h-3 rounded-sm bg-orange-500/80 shrink-0"
                          style={{ width: `${Math.max(2, (s.points / maxSeasonPoints) * 70)}%` }}
                        />
                        <span className="font-mono text-xs text-orange-400 tabular-nums">{s.points}</span>
                      </span>
                      <span className={`font-mono text-sm text-right tabular-nums ${t ? t.color : "text-neutral-400"}`}>{s.rank}</span>
                    </Link>
                  );
                })}
              />
            </section>
          </aside>
        </div>
      </main>
      <PhotoCreditsToast
        items={wall.flatMap((a, i) => {
          const ph = photos[i];
          return ph ? [{ who: a.display_name, credit: photoCredit(ph), url: ph.sourceUrl }] : [];
        })}
      />
    </div>
  );
}

function ResultsTable({ rows, showPoints }: { rows: CountryResultRow[]; showPoints: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">None this season.</p>;
  return <ViewAllList noun="results" initial={15} scrollOnMobile items={rows.map((r, i) => <ResultRow key={i} r={r} showPoints={showPoints} />)} />;
}

function ResultRow({ r, showPoints }: { r: CountryResultRow; showPoints: boolean }) {
  return (
    <div
      className={`grid ${showPoints ? "grid-cols-[3.25rem_1.75rem_1fr_3rem]" : "grid-cols-[3.25rem_1fr]"} items-center gap-x-2 px-3 py-1.5 text-sm bg-neutral-900/40`}
    >
      <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(r.date)}</span>
      {showPoints && <span className="text-xs text-neutral-400 tabular-nums">{r.place}</span>}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <Link
            href={`/meets/${encodeURIComponent(r.event_name)}?year=${r.year}&discipline=${encodeURIComponent(r.athletics_event)}`}
            className="truncate hover:text-orange-400"
          >
            {r.event_name}
          </Link>
          <TierBadge tier={r.competition_level} />
        </span>
        <span className="block text-[11px] text-neutral-500 truncate">
          {eventLabel(r.athletics_event)} ·{" "}
          <Link href={`/athletes/${r.athlete_id}`} className="text-neutral-300 hover:text-orange-400">
            {r.display_name}
          </Link>{" "}
          · <span className="font-mono">{r.mark_display}</span>
        </span>
      </span>
      {showPoints && (
        <span className="font-mono text-sm text-orange-400 text-right tabular-nums">{r.competition_score}</span>
      )}
    </div>
  );
}
