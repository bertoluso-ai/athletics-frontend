import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import YearSelect from "@/components/YearSelect";
import { flagUrlWide } from "@/lib/flags";
import { eventLabel, TIER_LABELS } from "@/lib/events";
import { getAthletePhotoInfo, photoCredit } from "@/lib/wikipedia";
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

type SortKey = "points" | "name" | "age" | "event";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "points", label: "points" },
  { key: "name", label: "name" },
  { key: "age", label: "age" },
  { key: "event", label: "discipline" },
];

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
  searchParams: Promise<{ year?: string; gender?: string; age?: string; sort?: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const sp = await searchParams;
  const years = await getCountryYears();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const f = parseCountryFilters(sp);
  const sort: SortKey = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as SortKey) : "points";

  const [name, ranking, detail] = await Promise.all([
    getCountryName(code),
    getCountryRanking(year, f),
    getCountryDetail(code, year, f),
  ]);
  const me = ranking.find((r) => r.code === code);
  const tier = me ? tierForRank(me.rank) : null;
  const { athletes, lastWins, topResults, seasons } = detail;

  const scoring = athletes.filter((a) => a.counts);
  // three lookups at a time: Wikimedia throttles bursts
  const photos: Awaited<ReturnType<typeof getAthletePhotoInfo>>[] = [];
  const wall = scoring.slice(0, 12);
  for (let i = 0; i < wall.length; i += 3) {
    photos.push(...(await Promise.all(wall.slice(i, i + 3).map((a) => getAthletePhotoInfo(a.display_name, a.birth_year)))));
  }

  const squad = [...athletes].sort((a, b) => {
    if (sort === "name") return a.display_name.localeCompare(b.display_name);
    if (sort === "age") return (b.birth_year ?? 0) - (a.birth_year ?? 0);
    if (sort === "event") return a.main_event.localeCompare(b.main_event) || b.points - a.points;
    return b.points - a.points;
  });
  const maxSeasonPoints = Math.max(1, ...seasons.map((s) => s.points));
  const bigFlag = flagUrlWide(code, 80);
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
          {bigFlag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bigFlag} alt={name} className="h-8 rounded shadow" />
          )}
          <h1 className="text-2xl lg:text-3xl font-bold">{name}</h1>
          {tier && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${tier.border} ${tier.color}`}>{tier.label}</span>
          )}
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

        {/* Gender / category, same as the list */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
            {(["Men", "Women"] as const).map((g) => (
              <Link
                key={g}
                href={`/countries/${code}?${qs(year, { ...f, gender: g })}`}
                className={`px-2.5 py-1 rounded ${f.gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {g}
              </Link>
            ))}
          </div>
          {(["", "U23", "U20", "U18"] as const).map((a) => (
            <Link
              key={a || "all"}
              href={`/countries/${code}?${qs(year, { ...f, age: a || undefined })}`}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                (f.age ?? "") === a ? "bg-neutral-100 text-black border-neutral-100" : "border-neutral-700 text-neutral-400"
              }`}
            >
              {a || "All ages"}
            </Link>
          ))}
        </div>

        {/* Key numbers */}
        <div className="flex flex-wrap gap-2 mb-6 text-sm">
          {[
            { label: "Rank", value: me ? `#${me.rank}` : "—" },
            { label: "Points", value: me?.points ?? 0 },
            { label: "Wins", value: me?.wins ?? 0 },
            { label: "Scoring athletes", value: `${scoring.length}/${COUNTED_ATHLETES}` },
            { label: "Athletes with points", value: athletes.length },
          ].map((k) => (
            <span key={k.label} className="flex items-center gap-1.5">
              <span className="text-neutral-400">{k.label}</span>
              <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500 text-black">{k.value}</span>
            </span>
          ))}
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

            <ResultsTable title="Latest wins" rows={lastWins} showPoints={false} />
            <ResultsTable title="Top results" rows={topResults} showPoints />
          </div>

          {/* Right column: squad + seasons */}
          <aside className="flex flex-col gap-8">
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Squad</h2>
                <span className="flex gap-2 text-[11px]">
                  {SORTS.map((s) => (
                    <Link
                      key={s.key}
                      href={`/countries/${code}?${qs(year, f, { sort: s.key })}`}
                      className={sort === s.key ? "text-orange-400" : "text-neutral-500 hover:text-neutral-300"}
                    >
                      {s.label}
                    </Link>
                  ))}
                </span>
              </div>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden max-h-[36rem] overflow-y-auto">
                {squad.map((a) => (
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
                {squad.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No athletes with points.</div>}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Orange = one of the {COUNTED_ATHLETES} athletes whose points count for the country.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Seasons</h2>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                <div className="grid grid-cols-[2.75rem_1fr_3rem] gap-x-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  <span />
                  <span>Points</span>
                  <span className="text-right">#</span>
                </div>
                {seasons.map((s) => {
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
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ResultsTable({ title, rows, showPoints }: { title: string; rows: CountryResultRow[]; showPoints: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">None this season.</p>
      ) : (
        <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
          {rows.map((r, i) => (
            <div
              key={i}
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
          ))}
        </div>
      )}
    </section>
  );
}
