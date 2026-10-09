import Link from "next/link";
import Flag from "@/components/Flag";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import CalendarAutoForm from "@/components/CalendarAutoForm";
import DateField from "@/components/DateField";
import { eventLabel, EVENT_GROUPS, TIER_LABELS } from "@/lib/events";
import { getCalendar, getCalendarYears, TIER_ORDER, type CalendarSort } from "@/lib/calendar";
import { getAthleteSlugs, athleteHref, getAllNationalities } from "@/lib/queries";
import { AREAS } from "@/lib/country-data";

export const revalidate = 3600;

// Season calendar (after the ProCyclingStats calendar): every competition
// of the year at or above a tier, held ones with their headline
// performance, upcoming ones with what's on the programme. Filterable by
// discipline, host area/nation and an exact date range.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAGE_SIZE = 100;
const ALL_EVENTS: string[] = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women] as string[])));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

const QUALITY_HELP = "Competition quality: strength of the fields it actually gathered (see Races)";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    tier?: string | string[];
    month?: string | string[];
    discipline?: string;
    area?: string;
    nationality?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const [years, nations] = await Promise.all([getCalendarYears(), getAllNationalities()]);
  const thisYear = new Date().getFullYear();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years.includes(thisYear) ? thisYear : years[0];
  const tierValues = Array.isArray(sp.tier) ? sp.tier : sp.tier ? sp.tier.split(",") : [];
  const selectedTiers: string[] =
    tierValues.length === 0 ? [...TIER_ORDER] : tierValues.filter((t) => TIER_ORDER.includes(t as (typeof TIER_ORDER)[number]));
  const from = sp.from && ISO_DATE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && ISO_DATE.test(sp.to) ? sp.to : undefined;
  const ranged = !!(from || to);
  const monthValues = Array.isArray(sp.month) ? sp.month : sp.month ? sp.month.split(",") : [];
  // No month in the URL at all, viewing the current year: default to the
  // current month instead of "All year". A date range replaces both.
  const thisMonth = new Date().getMonth() + 1;
  const selectedMonths: number[] = ranged
    ? []
    : sp.month === undefined && year === thisYear
    ? [thisMonth]
    : monthValues.map(Number).filter((m) => m >= 1 && m <= 12);
  const discipline = sp.discipline && ALL_EVENTS.includes(sp.discipline) ? sp.discipline : undefined;
  const area = sp.area && sp.area in AREAS ? sp.area : undefined;
  const nationOptions = area ? nations.filter((n) => n.area === area) : nations;
  const nation = sp.nationality && nationOptions.some((n) => n.code === sp.nationality) ? sp.nationality : undefined;
  const sort: CalendarSort = sp.sort === "name" || sp.sort === "tier" || sp.sort === "quality" ? sp.sort : "date";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getCalendar({
    year, months: selectedMonths, tiers: selectedTiers, discipline, area, nation, from, to,
    sort, dir, page, pageSize: PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const today = new Date().toISOString().slice(0, 10);
  const athleteSlugs = await getAthleteSlugs(rows.map((r) => r.top_athlete_id).filter((id): id is string => !!id));

  const href = (over: { sort?: CalendarSort; dir?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (ranged) {
      if (from) q.set("from", from);
      if (to) q.set("to", to);
    } else {
      q.set("year", String(year));
      if (selectedMonths.length === 0) q.set("month", ""); // all year, not the current-month default
      selectedMonths.forEach((m) => q.append("month", String(m)));
    }
    tierValues.forEach((t) => q.append("tier", t));
    if (discipline) q.set("discipline", discipline);
    if (area) q.set("area", area);
    if (nation) q.set("nationality", nation);
    q.set("sort", over.sort ?? sort);
    q.set("dir", over.dir ?? dir);
    if (over.page && over.page > 1) q.set("page", String(over.page));
    return `/calendar?${q.toString()}`;
  };
  // first click on Quality sorts best-first; the others start ascending
  const sortHref = (col: CalendarSort) =>
    href({ sort: col, dir: sort === col ? (dir === "asc" ? "desc" : "asc") : col === "quality" ? "desc" : "asc" });
  const sortArrow = (col: CalendarSort) => (sort === col ? (dir === "asc" ? " ▲" : " ▼") : "");
  const selectClass = "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";
  const hasExtraFilters = !!(discipline || area || nation || ranged);
  const GRID = "grid-cols-[6rem_minmax(0,1.1fr)_minmax(0,1.25fr)_3.5rem_3rem]";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Calendar</h1>

        {/* No titles and no Filter button, same as Races: every control applies on
            change (see CalendarAutoForm). Row 1 = when, row 2 = what/where. */}
        <CalendarAutoForm key={JSON.stringify(sp)} action="/calendar" className="flex flex-col gap-2 mb-4">
          {/* "" = all year; without it an empty Month falls back to the current month */}
          <input type="hidden" name="month" value="" />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          {/* Same scrolling rows as Races (pill-row): nothing wraps, anything that
              doesn't fit scrolls sideways. Year/Month/dates are kept narrow so the
              four of row 1 fit a phone. */}
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0">
            <select name="year" defaultValue={year} disabled={ranged} aria-label="Year" className={`shrink-0 w-16 h-[30px] px-1.5 ${selectClass} disabled:opacity-40`}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <MultiSelectDropdown
              name="month"
              className={`shrink-0 w-[4.75rem] ${ranged ? "opacity-40 pointer-events-none" : ""}`}
              placeholder="All year"
              defaultSelected={selectedMonths.map(String)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
            <DateField name="from" defaultValue={from} label="From" />
            <DateField name="to" defaultValue={to} label="To" />
          </div>
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0">
            <MultiSelectDropdown
              name="tier"
              className="shrink-0 min-w-[6.5rem]"
              placeholder="All levels"
              defaultSelected={tierValues}
              options={TIER_ORDER.map((t) => ({ value: t, label: t, title: TIER_LABELS.find((x) => x.value === t)?.label ?? t }))}
            />
            <select name="discipline" defaultValue={discipline ?? ""} aria-label="Discipline" className={`shrink-0 ${selectClass}`}>
              <option value="">All disciplines</option>
              {ALL_EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {eventLabel(ev)}
                </option>
              ))}
            </select>
            <select name="area" defaultValue={area ?? ""} aria-label="Area" className={`shrink-0 ${selectClass}`}>
              <option value="">All areas</option>
              {Object.entries(AREAS).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <select name="nationality" defaultValue={nation ?? ""} aria-label="Nation" className={`shrink-0 ${selectClass}`}>
              <option value="">All nations</option>
              {nationOptions.map((n) => (
                <option key={n.code} value={n.code}>
                  {n.name}
                </option>
              ))}
            </select>
            {(hasExtraFilters || tierValues.length > 0) && (
              <Link href="/calendar" className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300">
                clear
              </Link>
            )}
          </div>
        </CalendarAutoForm>
        {ranged && (
          <p className="text-xs text-neutral-500 -mt-2 mb-3">
            Showing {from ?? "…"} → {to ?? "…"} (the date range replaces year and month).
          </p>
        )}

        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className={`hidden sm:grid ${GRID} gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800`}>
            <Link href={sortHref("date")} className="hover:text-neutral-200">
              Date{sortArrow("date")}
            </Link>
            <Link href={sortHref("name")} className="hover:text-neutral-200">
              Competition{sortArrow("name")}
            </Link>
            <span>{discipline ? `Top performance · ${eventLabel(discipline)}` : "Top performance"}</span>
            <Link href={sortHref("quality")} title={QUALITY_HELP} className="text-right hover:text-neutral-200">
              Quality{sortArrow("quality")}
            </Link>
            <Link href={sortHref("tier")} className="text-right hover:text-neutral-200">
              Level{sortArrow("tier")}
            </Link>
          </div>
          <div className="divide-y divide-neutral-800">
            {rows.map((r, i) => {
              const live = r.kind === "upcoming" && !!r.date_start && !!r.date_end && r.date_start <= today && r.date_end >= today;
              // Deep-link to the exact discipline+gender of the advertised top
              // performance, so /meets opens on that section.
              const nameLink =
                r.kind === "past"
                  ? `/meets/${encodeURIComponent(r.name)}?${new URLSearchParams({
                      year: (r.date_start ?? String(year)).slice(0, 4),
                      ...(r.top_event ? { discipline: r.top_event } : {}),
                      ...(r.top_gender ? { gender: r.top_gender } : {}),
                    }).toString()}`
                  : r.past_event_name
                  ? `/meets/${encodeURIComponent(r.past_event_name)}`
                  : null;
              const quality =
                r.level != null ? (
                  <span className="font-mono text-xs text-neutral-300" title={QUALITY_HELP}>
                    {Math.round(r.level)}
                  </span>
                ) : (
                  <span className="text-neutral-700 text-xs">—</span>
                );
              const topPerformance =
                r.kind === "past" && r.top_athlete ? (
                  <>
                    <Flag code={r.top_nationality} className="mr-1" />
                    <Link href={athleteHref(r.top_athlete_id!, athleteSlugs)} className="text-neutral-200 hover:text-orange-400">
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
                <div key={i} className={`relative ${r.kind === "upcoming" ? "bg-neutral-950" : "bg-neutral-900/40"}`}>
                  {/* Full-row click target (see the meet link above); the nested
                      athlete link stays independently clickable. */}
                  {nameLink && <Link href={nameLink} className="absolute inset-0 z-0" tabIndex={-1} aria-hidden="true" />}
                  {/* phones: a card */}
                  <div
                    className={`sm:hidden flex flex-col gap-1 px-3 py-3 text-sm ${
                      nameLink ? "relative z-10 pointer-events-none [&_a]:pointer-events-auto" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-neutral-400 tabular-nums">{fmtRange(r.date_start, r.date_end)}</span>
                      <span className="flex items-center gap-2">
                        {r.level != null && quality}
                        <TierBadge tier={r.tier} />
                      </span>
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

                  {/* desktop: table row */}
                  <div
                    className={`hidden sm:grid ${GRID} gap-x-3 items-center px-3 py-2 text-sm ${
                      nameLink ? "relative z-10 pointer-events-none [&_a]:pointer-events-auto" : ""
                    }`}
                  >
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
                    <span className="text-right">{quality}</span>
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

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">
                ← Prev
              </Link>
            )}
            <span className="text-neutral-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            {page < pages && (
              <Link href={href({ page: page + 1 })} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">
                Next →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
