import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import { eventLabel, TIER_LABELS } from "@/lib/events";
import { getCalendar, getCalendarYears, TIER_ORDER } from "@/lib/calendar";

export const revalidate = 3600;

// Season calendar (after the ProCyclingStats calendar): every competition
// of the year at or above a tier, held ones with their headline
// performance, upcoming ones with what's on the programme.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtRange(a: string | null, b: string | null) {
  if (!a) return "—"; // source gives only the year
  const d = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  return !b || a === b ? d(a) : `${d(a)} › ${d(b)}`;
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

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; tier?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const years = await getCalendarYears();
  const thisYear = new Date().getFullYear();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years.includes(thisYear) ? thisYear : years[0];
  const tier = TIER_ORDER.includes(sp.tier as (typeof TIER_ORDER)[number]) ? sp.tier! : "GL";
  const month = sp.month ? Number(sp.month) : undefined;
  const rows = await getCalendar(year, tier, month);
  const today = new Date().toISOString().slice(0, 10);

  const href = (over: { year?: number; tier?: string; month?: number | null }) => {
    const q = new URLSearchParams({ year: String(over.year ?? year), tier: over.tier ?? tier });
    const m = over.month === null ? undefined : over.month ?? month;
    if (m) q.set("month", String(m));
    return `/calendar?${q.toString()}`;
  };
  const pill = (active: boolean) =>
    `shrink-0 text-xs px-2.5 py-1 rounded-full border ${active ? "bg-neutral-100 text-black border-neutral-100" : "border-neutral-700 text-neutral-400 hover:text-neutral-200"}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Calendar</h1>

        <form action="/calendar" className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-xs text-neutral-400">Year</label>
          <select name="year" defaultValue={year} className="bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label className="text-xs text-neutral-400 ml-2">Level</label>
          <select name="tier" defaultValue={tier} className="bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700">
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {t} and above · {TIER_LABELS.find((x) => x.value === t)?.label ?? ""}
              </option>
            ))}
          </select>
          {month && <input type="hidden" name="month" value={month} />}
          <button className="text-xs px-3 py-1.5 rounded bg-orange-500 text-black font-semibold">Filter</button>
        </form>

        <div className="pill-row flex flex-nowrap overflow-x-auto gap-1 mb-4">
          <Link href={href({ month: null })} className={pill(!month)}>
            All year
          </Link>
          {MONTHS.map((m, i) => (
            <Link key={m} href={href({ month: i + 1 })} className={pill(month === i + 1)}>
              {m}
            </Link>
          ))}
        </div>

        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="hidden sm:grid grid-cols-[6rem_minmax(0,1.1fr)_minmax(0,1.25fr)_3rem] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
            <span>Date</span>
            <span>Competition</span>
            <span>Top performance</span>
            <span className="text-right">Level</span>
          </div>
          <div className="divide-y divide-neutral-800">
            {rows.map((r, i) => {
              const live = r.kind === "upcoming" && !!r.date_start && !!r.date_end && r.date_start <= today && r.date_end >= today;
              const nameLink = r.kind === "past" ? `/meets/${encodeURIComponent(r.name)}?year=${year}` : null;
              const topPerformance =
                r.kind === "past" && r.top_athlete ? (
                  <>
                    <Flag code={r.top_nationality} className="mr-1" />
                    <Link href={`/athletes/${r.top_athlete_id}`} className="text-neutral-200 hover:text-orange-400">
                      {r.top_athlete}
                    </Link>
                    <span className="text-neutral-500"> · {eventLabel(r.top_event ?? "")} · </span>
                    <span className="font-mono font-semibold text-orange-400">{r.top_mark}</span>
                  </>
                ) : r.kind === "upcoming" ? (
                  <span className="text-neutral-500">{[r.city, r.disciplines].filter(Boolean).join(" · ")}</span>
                ) : (
                  <span className="text-neutral-600">{r.n_events} events</span>
                );

              return (
                <div key={i} className={r.kind === "upcoming" ? "bg-neutral-950" : "bg-neutral-900/40"}>
                  {/* phones: a proper card, one line each, not a squeezed grid */}
                  <div className="sm:hidden flex flex-col gap-1 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-neutral-400 tabular-nums">{fmtRange(r.date_start, r.date_end)}</span>
                      <TierBadge tier={r.tier} />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Flag code={r.country} />
                      {nameLink ? (
                        <Link href={nameLink} className="truncate font-medium hover:text-orange-400">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="truncate text-neutral-300">{r.name}</span>
                      )}
                      {live && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white shrink-0">LIVE</span>}
                    </div>
                    <div className="min-w-0 text-xs truncate">{topPerformance}</div>
                  </div>

                  {/* desktop: the 4-column table row */}
                  <div className="hidden sm:grid grid-cols-[6rem_minmax(0,1.1fr)_minmax(0,1.25fr)_3rem] gap-x-3 items-center px-3 py-2 text-sm">
                    <span className="text-xs text-neutral-400 tabular-nums">{fmtRange(r.date_start, r.date_end)}</span>
                    <span className="min-w-0 flex items-center gap-2">
                      <Flag code={r.country} />
                      {nameLink ? (
                        <Link href={nameLink} className="truncate font-medium hover:text-orange-400">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="truncate text-neutral-300">{r.name}</span>
                      )}
                      {live && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white shrink-0">LIVE</span>}
                    </span>
                    <span className="min-w-0 text-xs truncate">{topPerformance}</span>
                    <span className="text-right">
                      <TierBadge tier={r.tier} />
                    </span>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No competitions for this selection.</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
