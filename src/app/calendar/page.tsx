import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { eventLabel, TIER_LABELS } from "@/lib/events";
import { getCalendar, getCalendarYears, TIER_ORDER } from "@/lib/calendar";
import { getAthleteSlugs, athleteHref } from "@/lib/queries";

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
  searchParams: Promise<{
    year?: string;
    tier?: string | string[];
    month?: string | string[];
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const years = await getCalendarYears();
  const thisYear = new Date().getFullYear();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years.includes(thisYear) ? thisYear : years[0];
  const tierValues = Array.isArray(sp.tier) ? sp.tier : sp.tier ? sp.tier.split(",") : [];
  const selectedTiers: string[] =
    tierValues.length === 0 ? [...TIER_ORDER] : tierValues.filter((t) => TIER_ORDER.includes(t as (typeof TIER_ORDER)[number]));
  const monthValues = Array.isArray(sp.month) ? sp.month : sp.month ? sp.month.split(",") : [];
  // No month in the URL at all, viewing the current year: default to the
  // current month instead of "All year" (which, sorted by date ascending,
  // visually looked like it defaulted to January).
  const thisMonth = new Date().getMonth() + 1;
  const selectedMonths: number[] =
    sp.month === undefined && year === thisYear ? [thisMonth] : monthValues.map(Number).filter((m) => m >= 1 && m <= 12);
  const sort = sp.sort === "name" || sp.sort === "tier" ? sp.sort : "date";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const rows = await getCalendar(year, selectedTiers, selectedMonths, sort, dir);
  const today = new Date().toISOString().slice(0, 10);
  const athleteSlugs = await getAthleteSlugs(rows.map((r) => r.top_athlete_id).filter((id): id is string => !!id));

  const href = (over: { year?: number; tier?: string[]; month?: number[]; sort?: string; dir?: string }) => {
    const q = new URLSearchParams();
    q.set("year", String(over.year ?? year));
    (over.tier ?? selectedTiers).forEach((t) => q.append("tier", t));
    (over.month ?? selectedMonths).forEach((m) => q.append("month", String(m)));
    q.set("sort", over.sort ?? sort);
    q.set("dir", over.dir ?? dir);
    return `/calendar?${q.toString()}`;
  };
  const sortHref = (col: "date" | "name" | "tier") => href({ sort: col, dir: sort === col && dir === "asc" ? "desc" : "asc" });
  const sortArrow = (col: string) => (sort === col ? (dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Calendar</h1>

        <form action="/calendar" className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Year</label>
            <select name="year" defaultValue={year} className="bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Month</label>
            <MultiSelectDropdown
              name="month"
              className="min-w-[8rem]"
              placeholder="All year"
              defaultSelected={selectedMonths.map(String)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Level</label>
            <MultiSelectDropdown
              name="tier"
              className="min-w-[8rem]"
              placeholder="All levels"
              defaultSelected={tierValues}
              options={TIER_ORDER.map((t) => ({ value: t, label: t, title: TIER_LABELS.find((x) => x.value === t)?.label ?? t }))}
            />
          </div>
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <button className="text-xs px-3 py-1.5 rounded bg-orange-500 text-black font-semibold">Filter</button>
        </form>

        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="hidden sm:grid grid-cols-[6rem_minmax(0,1.1fr)_minmax(0,1.25fr)_3rem] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
            <Link href={sortHref("date")} className="hover:text-neutral-200">
              Date{sortArrow("date")}
            </Link>
            <Link href={sortHref("name")} className="hover:text-neutral-200">
              Competition{sortArrow("name")}
            </Link>
            <span>Top performance</span>
            <Link href={sortHref("tier")} className="text-right hover:text-neutral-200">
              Level{sortArrow("tier")}
            </Link>
          </div>
          <div className="divide-y divide-neutral-800">
            {rows.map((r, i) => {
              const live = r.kind === "upcoming" && !!r.date_start && !!r.date_end && r.date_start <= today && r.date_end >= today;
              const nameLink = r.kind === "past" ? `/meets/${encodeURIComponent(r.name)}?year=${year}` : null;
              const topPerformance =
                r.kind === "past" && r.top_athlete ? (
                  <>
                    <Flag code={r.top_nationality} className="mr-1" />
                    <Link href={athleteHref(r.top_athlete_id!, athleteSlugs)} className="text-neutral-200 hover:text-orange-400">
                      {r.top_athlete}
                    </Link>
                    <span className="text-neutral-500"> · {eventLabel(r.top_event ?? "")} · </span>
                    <span className="font-mono font-semibold text-orange-400">{r.top_mark}</span>
                    {r.level != null && (
                      <span
                        className="ml-1.5 text-[10px] font-mono px-1 py-0.5 rounded bg-neutral-800 text-neutral-400"
                        title="Field strength of this edition (0-100): mostly its competition tier, with a smaller adjustment for how strong the actual entrants were"
                      >
                        Quality {Math.round(r.level)}
                      </span>
                    )}
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
