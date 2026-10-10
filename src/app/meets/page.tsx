import Link from "next/link";
import Flag from "@/components/Flag";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import CalendarAutoForm from "@/components/CalendarAutoForm";
import DateField from "@/components/DateField";
import NavIcon from "@/components/NavIcons";
import { eventLabel, EVENT_GROUPS, TIER_LABELS, sortEventsAlpha } from "@/lib/events";
import { getCalendar, getRaces, getCalendarYears, TIER_ORDER, type CalendarSort } from "@/lib/calendar";
import { RACE_TYPES } from "@/lib/raceTypes";
import { getAthleteSlugs, athleteHref, getAllNationalities } from "@/lib/queries";
import { AREAS } from "@/lib/country-data";

export const revalidate = 3600;

// Meets: the old Calendar and Races pages merged. Both lists answer "what was
// (or will be) competed and how good was it", at two levels -- a COMPETITION
// (the whole championship/meeting, with upcoming ones) or a single RACE
// (one discipline+gender+round of it). One filter bar serves both; Nation and
// Area are always the HOST country of the competition. Gender, age and
// type (track / indoor / road / cross country / race walk / mountain & trail)
// only exist per race, so they only show in the Races view.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAGE_SIZE = 100;
const ALL_EVENTS: string[] = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women] as string[])));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AGES = ["U23", "U20", "U18"] as const;

type View = "competitions" | "races";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Calendar-style date: big day over a small month ("10-12" over "Oct"). Some
// historical sources have no exact date, only the year -- show that instead.
// `inline` is the one-line version used in the phone cards.
function DateBlock({ a, b, year, inline = false }: { a: string | null; b: string | null; year?: number | null; inline?: boolean }) {
  if (!a) return <span className="text-xs text-neutral-500">{year ? String(year) : "—"}</span>;
  const day = (s: string) => String(Number(s.slice(8, 10)));
  const mon = (s: string) => MONTH_ABBR[Number(s.slice(5, 7)) - 1];
  const range = !!b && b !== a;
  const days = range ? `${day(a)}-${day(b!)}` : day(a);
  const months = range && mon(a) !== mon(b!) ? `${mon(a)}-${mon(b!)}` : mon(a);
  if (inline) return <span className="text-xs font-semibold text-neutral-300 tabular-nums">{days} {months}</span>;
  return (
    <span className="inline-flex flex-col items-center justify-center leading-none min-w-10 px-1.5 py-1">
      <span className="text-sm font-bold tabular-nums">{days}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-neutral-500">{months}</span>
    </span>
  );
}

// Level badge scaled by rank: the big championships are solid orange, the
// middle tiers soft orange, the small meets stay grey.
const TIER_BADGE: Record<string, string> = {
  OW: "bg-orange-100 text-orange-800",
  DF: "bg-orange-100 text-orange-800",
  GW: "bg-orange-100 text-orange-800",
  GL: "bg-orange-50 text-orange-700",
  A: "bg-orange-50 text-orange-700",
  B: "bg-neutral-800 text-orange-700",
};

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span
      title={TIER_LABELS.find((t) => t.value === tier)?.label ?? tier}
      className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${TIER_BADGE[tier] ?? "text-neutral-400"}`}
    >
      {tier}
    </span>
  );
}

// Quality as a heat chip: the stronger the field, the stronger the orange.
function QualityChip({ value }: { value: number }) {
  const tone =
    value >= 1000 ? "bg-orange-100 text-orange-800" : value >= 500 ? "bg-orange-50 text-orange-700" : "text-neutral-400";
  return (
    <span className={`inline-block min-w-11 text-center font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${tone}`} title={QUALITY_HELP}>
      {Math.round(value)}
    </span>
  );
}

// the left edge of a row marks the top competitions
const rowAccent = (tier: string | null) =>
  tier === "OW" || tier === "DF" || tier === "GW" ? "border-l-orange-400" : tier === "GL" ? "border-l-orange-200" : "border-l-transparent";

const QUALITY_HELP = "Quality: strength of the fields actually gathered (a whole competition, or this single race)";

export default async function MeetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    year?: string;
    tier?: string | string[];
    month?: string | string[];
    discipline?: string;
    area?: string;
    nationality?: string;
    from?: string;
    to?: string;
    gender?: string;
    age?: string;
    type?: string;
    surface?: string;
    sort?: string;
    dir?: string;
    page?: string;
    // legacy /races parameters
    event?: string;
    indoor?: string;
  }>;
}) {
  const sp = await searchParams;
  const view: View = sp.view === "races" ? "races" : "competitions";
  const [years, nations] = await Promise.all([getCalendarYears(), getAllNationalities()]);
  const thisYear = new Date().getFullYear();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years.includes(thisYear) ? thisYear : years[0];
  const tierValues = Array.isArray(sp.tier) ? sp.tier : sp.tier ? sp.tier.split(",") : [];
  const validTiers = tierValues.filter((t) => TIER_ORDER.includes(t as (typeof TIER_ORDER)[number]));
  // Competitions: no level picked = every level that has one. Races: no level
  // picked = no level filter at all (races without a level are included).
  const selectedTiers: string[] = validTiers.length === 0 && view === "competitions" ? [...TIER_ORDER] : validTiers;
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
  const disciplineParam = sp.discipline ?? sp.event;
  const discipline = disciplineParam && ALL_EVENTS.includes(disciplineParam) ? disciplineParam : undefined;
  const area = sp.area && sp.area in AREAS ? sp.area : undefined;
  const nationOptions = area ? nations.filter((n) => n.area === area) : nations;
  const nation = sp.nationality && nationOptions.some((n) => n.code === sp.nationality) ? sp.nationality : undefined;
  const gender = sp.gender === "Men" || sp.gender === "Women" ? sp.gender : undefined;
  const age = AGES.find((a) => a === sp.age);
  // legacy ?surface=indoor / ?indoor=true links keep working as type=indoor
  const typeParam = sp.type ?? (sp.surface === "indoor" || sp.indoor === "true" ? "indoor" : undefined);
  const type = RACE_TYPES.find((t) => t.value === typeParam)?.value;

  // "recent" is the old Races name for the date sort; races have no name sort
  const rawSort = sp.sort === "recent" ? "date" : sp.sort;
  const sort: CalendarSort =
    rawSort === "tier" || rawSort === "quality" || (rawSort === "name" && view === "competitions") ? rawSort : "date";
  // each column starts at its natural direction: competitions run chronologically
  // (upcoming ones last), races newest first, best quality / best level first
  const defaultDir = (col: CalendarSort) =>
    col === "quality" ? "desc" : col === "date" ? (view === "races" ? "desc" : "asc") : "asc";
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : defaultDir(sort);
  const page = Math.max(1, Number(sp.page) || 1);

  const base = { year, months: selectedMonths, tiers: selectedTiers, discipline, area, nation, from, to, sort, dir, page, pageSize: PAGE_SIZE };
  const competitions = view === "competitions" ? await getCalendar({ ...base, type }) : null;
  const races = view === "races" ? await getRaces({ ...base, gender, age, type }) : null;
  const rows = competitions?.rows ?? [];
  const raceRows = races?.rows ?? [];
  const total = competitions?.total ?? races?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const today = new Date().toISOString().slice(0, 10);
  const athleteSlugs = await getAthleteSlugs(
    [...rows.map((r) => r.top_athlete_id), ...raceRows.map((r) => r.top_athlete_id)].filter((id): id is string => !!id)
  );

  const href = (over: { view?: View; sort?: CalendarSort; dir?: string; page?: number; reset?: boolean }) => {
    const v = over.view ?? view;
    const q = new URLSearchParams();
    if (v === "races") q.set("view", "races");
    if (ranged) {
      if (from) q.set("from", from);
      if (to) q.set("to", to);
    } else {
      q.set("year", String(year));
      if (selectedMonths.length === 0) q.set("month", ""); // all year, not the current-month default
      selectedMonths.forEach((m) => q.append("month", String(m)));
    }
    validTiers.forEach((t) => q.append("tier", t));
    if (discipline) q.set("discipline", discipline);
    if (area) q.set("area", area);
    if (nation) q.set("nationality", nation);
    if (type) q.set("type", type);
    if (v === "races") {
      if (gender) q.set("gender", gender);
      if (age) q.set("age", age);
    }
    if (!over.reset) {
      q.set("sort", over.sort ?? sort);
      q.set("dir", over.dir ?? dir);
    }
    if (over.page && over.page > 1) q.set("page", String(over.page));
    return `/meets?${q.toString()}`;
  };
  // same column flips direction; a newly picked column starts descending
  // (names ascending), so one more click gives the opposite order
  const sortHref = (col: CalendarSort) =>
    href({ sort: col, dir: sort === col ? (dir === "asc" ? "desc" : "asc") : col === "name" ? "asc" : "desc" });
  const sortArrow = (col: CalendarSort) => (sort === col ? (dir === "asc" ? " ▲" : " ▼") : "");
  const selectClass = "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";
  const sc = (on: boolean) => (on ? "bg-orange-50 text-orange-700 text-xs rounded px-2 py-1.5 border border-orange-300 focus:outline-none" : selectClass);
  const hasExtraFilters = !!(discipline || area || nation || ranged || gender || age || type);
  const GRID = "grid-cols-[6rem_minmax(0,1.1fr)_minmax(0,1.25fr)_5rem_3.75rem]";

  const raceLink = (r: (typeof raceRows)[number]) =>
    `/meets/${encodeURIComponent(r.event_name)}?${new URLSearchParams({
      year: (r.date ?? String(r.year ?? year)).slice(0, 4),
      discipline: r.athletics_event,
      gender: r.gender,
    }).toString()}`;

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <div className="flex items-center justify-between gap-3 h-9 bg-tint text-neutral-100 px-3 sm:px-4 rounded-lg mb-3">
          <h1 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide">
            <NavIcon name="meets" className="w-4 h-4 shrink-0 text-neutral-400" />
            Meets
          </h1>
          <div className="flex rounded p-0.5 text-xs bg-white/60">
            {(["competitions", "races"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v, reset: true })}
                className={`px-3 py-0.5 rounded ${view === v ? "bg-neutral-950 text-neutral-100 font-semibold shadow-sm" : "text-neutral-400 hover:text-neutral-100"}`}
              >
                {v === "competitions" ? "Calendar" : "Races"}
              </Link>
            ))}
          </div>
        </div>

        {/* No titles and no Filter button: every control applies on change (see
            CalendarAutoForm). Row 1 = when, row 2 = what/where. Same scrolling
            rows as the rest of the site (pill-row): nothing wraps, anything that
            doesn't fit scrolls sideways. */}
        <CalendarAutoForm key={JSON.stringify(sp)} action="/meets" className="flex flex-col gap-2 mb-3 bg-neutral-950 border border-neutral-800 rounded-lg p-2 sm:p-3">
          {/* "" = all year; without it an empty Month falls back to the current month */}
          <input type="hidden" name="month" value="" />
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
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
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
            <MultiSelectDropdown
              name="tier"
              className="shrink-0 min-w-[6.5rem]"
              placeholder="All levels"
              defaultSelected={tierValues}
              options={TIER_ORDER.map((t) => ({ value: t, label: t, title: TIER_LABELS.find((x) => x.value === t)?.label ?? t }))}
            />
            <select name="discipline" defaultValue={discipline ?? ""} aria-label="Discipline" className={`shrink-0 ${sc(!!discipline)}`}>
              <option value="">All disciplines</option>
              {sortEventsAlpha(ALL_EVENTS).map((ev) => (
                <option key={ev} value={ev}>
                  {eventLabel(ev)}
                </option>
              ))}
            </select>
            <select name="area" defaultValue={area ?? ""} aria-label="Area" className={`shrink-0 ${sc(!!area)}`}>
              <option value="">All areas</option>
              {Object.entries(AREAS).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <select name="nationality" defaultValue={nation ?? ""} aria-label="Host nation" className={`shrink-0 ${sc(!!nation)}`}>
              <option value="">All nations</option>
              {nationOptions.map((n) => (
                <option key={n.code} value={n.code}>
                  {n.name}
                </option>
              ))}
            </select>
            <select name="type" defaultValue={type ?? ""} aria-label="Type" className={`shrink-0 ${sc(!!type)}`}>
                  <option value="">All types</option>
                  {RACE_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
            {view === "races" && (
              <>
                <select name="gender" defaultValue={gender ?? ""} aria-label="Gender" className={`shrink-0 ${sc(!!gender)}`}>
                  <option value="">Men &amp; Women</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                </select>
                <select name="age" defaultValue={age ?? ""} aria-label="Age" className={`shrink-0 ${sc(!!age)}`}>
                  <option value="">All ages</option>
                  {AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                
              </>
            )}
            {(hasExtraFilters || tierValues.length > 0) && (
              <Link href={view === "races" ? "/meets?view=races" : "/meets"} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300">
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

        {/* phones have no table header: a sort bar instead (tap again to flip) */}
        <div className="sm:hidden flex items-center gap-2 mb-2 text-xs">
          <span className="text-neutral-500">Sort</span>
          {([["date", "Date"], ["quality", "Quality"], ["tier", "Level"]] as [CalendarSort, string][]).map(([col, label]) => (
            <Link
              key={col}
              href={sortHref(col)}
              className={`px-2.5 py-1 rounded border ${sort === col ? "border-neutral-700 bg-tint text-neutral-100 font-semibold" : "border-neutral-700 bg-neutral-950 text-neutral-400"}`}
            >
              {label}{sortArrow(col)}
            </Link>
          ))}
        </div>

        <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950">
          <div className={`hidden sm:grid ${GRID} gap-x-3 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide bg-tint text-neutral-300`}>
            <Link href={sortHref("date")} className={`whitespace-nowrap hover:text-neutral-100 ${sort === "date" ? "text-neutral-100" : ""}`}>
              Date{sortArrow("date")}
            </Link>
            {view === "competitions" ? (
              <Link href={sortHref("name")} className={`hover:text-neutral-100 ${sort === "name" ? "text-neutral-100" : ""}`}>
                Competition{sortArrow("name")}
              </Link>
            ) : (
              <span>Competition</span>
            )}
            <span>{view === "competitions" && discipline ? `Top performance · ${eventLabel(discipline)}` : "Top performance"}</span>
            <Link href={sortHref("quality")} title={QUALITY_HELP} className={`text-right whitespace-nowrap hover:text-neutral-100 ${sort === "quality" ? "text-neutral-100" : ""}`}>
              Quality{sortArrow("quality")}
            </Link>
            <Link href={sortHref("tier")} className={`text-right whitespace-nowrap hover:text-neutral-100 ${sort === "tier" ? "text-neutral-100" : ""}`}>
              Level{sortArrow("tier")}
            </Link>
          </div>
          <div className="divide-y divide-neutral-800">
            {rows.map((r, i) => {
              const live = r.kind === "upcoming" && !!r.date_start && !!r.date_end && r.date_start <= today && r.date_end >= today;
              // Deep-link to the exact discipline+gender of the advertised top
              // performance, so the meet opens on that section.
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
              const quality = r.level != null ? <QualityChip value={r.level} /> : <span className="text-neutral-600 text-xs">—</span>;
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
                <div key={i} className={`relative border-l-2 ${rowAccent(r.tier)} bg-neutral-950 hover:bg-neutral-900`}>
                  {/* Full-row click target; the nested athlete link stays independently clickable. */}
                  {nameLink && <Link href={nameLink} className="absolute inset-0 z-0" tabIndex={-1} aria-hidden="true" />}
                  {/* phones: a card */}
                  <div
                    className={`sm:hidden flex flex-col gap-1 px-3 py-3 text-sm ${
                      nameLink ? "relative z-10 pointer-events-none [&_a]:pointer-events-auto" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <DateBlock a={r.date_start} b={r.date_end} inline />
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
                    <span>
                      <DateBlock a={r.date_start} b={r.date_end} />
                    </span>
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

            {raceRows.map((r, i) => {
              const nameLink = raceLink(r);
              const raceLabel = `${eventLabel(r.athletics_event)}${r.gender === "Women" ? " · W" : r.gender === "Men" ? " · M" : ""}${r.round ? ` · ${r.round}` : ""}`;
              const winner = r.top_athlete ? (
                <>
                  <Flag code={r.top_nationality} className="mr-1" />
                  <Link href={athleteHref(r.top_athlete_id!, athleteSlugs)} className="text-neutral-200 hover:text-orange-400">
                    {r.top_athlete}
                  </Link>
                  <span className="text-neutral-500"> · {raceLabel} · </span>
                  <span className="font-mono font-semibold text-orange-400">{r.top_mark}</span>
                </>
              ) : (
                <span className="text-neutral-600">{raceLabel}</span>
              );
              return (
                <div key={i} className={`relative border-l-2 ${rowAccent(r.tier)} bg-neutral-950 hover:bg-neutral-900`}>
                  <Link href={nameLink} className="absolute inset-0 z-0" tabIndex={-1} aria-hidden="true" />
                  {/* phones: a card */}
                  <div className="sm:hidden relative z-10 pointer-events-none [&_a]:pointer-events-auto flex flex-col gap-1 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <DateBlock a={r.date} b={r.date} year={r.year} inline />
                      <span className="flex items-center gap-2">
                        <QualityChip value={r.race_level} />
                        <TierBadge tier={r.tier} />
                      </span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Flag code={r.host_country} />
                      <Link href={nameLink} className="truncate font-medium hover:text-orange-400">
                        {r.event_name}
                      </Link>
                    </div>
                    <div className="min-w-0 text-xs truncate">{winner}</div>
                  </div>

                  {/* desktop: table row */}
                  <div className={`hidden sm:grid ${GRID} gap-x-3 items-center px-3 py-2 text-sm relative z-10 pointer-events-none [&_a]:pointer-events-auto`}>
                    <span>
                      <DateBlock a={r.date} b={r.date} year={r.year} />
                    </span>
                    <span className="min-w-0 flex items-center gap-2">
                      <Flag code={r.host_country} />
                      <Link href={nameLink} className="truncate font-medium hover:text-orange-400">
                        {r.event_name}
                      </Link>
                    </span>
                    <span className="min-w-0 text-xs truncate">{winner}</span>
                    <span className="text-right">
                      <QualityChip value={r.race_level} />
                    </span>
                    <span className="text-right">
                      <TierBadge tier={r.tier} />
                    </span>
                  </div>
                </div>
              );
            })}

            {rows.length === 0 && raceRows.length === 0 && (
              <div className="px-3 py-4 text-sm text-neutral-500">
                {view === "races" ? "No races for this selection." : "No competitions for this selection."}
              </div>
            )}
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
