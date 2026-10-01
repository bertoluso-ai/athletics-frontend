import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import EventFilters from "@/components/EventFilters";
import LinkSelect from "@/components/LinkSelect";
import YearlyProgressionChart from "@/components/YearlyProgressionChart";
import { GenericAthlete } from "@/components/Avatar";
import { getAthletePhotoInfo, photoCredit } from "@/lib/wikipedia";
import {
  getEventAllTimeBest, getEventYearBestMarks, getEventAvailableYears,
  getEventAllTimeBestRelay, getEventYearBestMarksRelay,
  getEventYearlyProgression, getEventBestByArea, getEventBestByCountry, getEventRecordTenure,
  getAthleteSlugs, athleteHref, getAvailableNationalities,
  type MarkRow, type RelayMarkRow,
} from "@/lib/queries";
import { eventLabel, EVENT_GROUPS, isRelayEvent, isFieldEvent, eventCategory } from "@/lib/events";
import { eventSlug, eventFromSlug } from "@/lib/slugs";
import { AREAS } from "@/lib/country-data";

export const revalidate = 3600;

// Disciplines: same look as Rankings (pill row of categories, gender
// toggle, discipline select) but content is historical marks, not a
// points table. Lives at /disciplines/[event-slug] (e.g. /disciplines/100m)
// -- a specific discipline is a first-class page of its own, not nested
// under a group key -- with a right-hand column (same width as Rankings'
// side menu) of context that doesn't fit the main table: best marks by
// continent/country, and who has held the all-time #1 mark longest.

function findGroup(event: string) {
  return EVENT_GROUPS.find((g) => event in g.names) ?? null;
}

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function MarkRowItem({ m, rank, athleteSlugs }: { m: MarkRow; rank: number; athleteSlugs: Map<string, string> }) {
  return (
    <Link href={athleteHref(m.athlete_id, athleteSlugs)} className="flex items-center justify-between px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800">
      <span className="text-sm flex items-center gap-2 min-w-0">
        <span className="text-neutral-500 font-mono text-xs w-4 shrink-0">{rank}</span>
        <Flag code={m.nationality} />
        <span className="truncate">{m.display_name}</span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {m.record === "WR" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>}
        <span className="font-mono text-sm text-orange-400">{m.mark_display}</span>
      </span>
    </Link>
  );
}

function RelayMarkRowItem({ m, rank }: { m: RelayMarkRow; rank: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/40">
      <span className="text-sm flex items-center gap-2 min-w-0">
        <span className="text-neutral-500 font-mono text-xs w-4 shrink-0">{rank}</span>
        <Flag code={m.nationality} />
        <span className="truncate">
          {m.nationality ?? "—"}
          <span className="text-neutral-500 font-normal ml-2 text-xs">{m.roster.map(lastName).join(" · ")}</span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {m.record === "WR" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>}
        <span className="font-mono text-sm text-orange-400">{m.mark_display}</span>
      </span>
    </div>
  );
}

async function PodiumPhoto({ name, gender, nationality }: { name: string; gender: string; nationality: string | null }) {
  const photo = await getAthletePhotoInfo(name);
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo.url} alt={name} title={photoCredit(photo)} className="absolute inset-0 w-full h-full object-cover" />
  ) : (
    <span className="absolute inset-0">
      <GenericAthlete name={name} gender={gender} nationality={nationality} />
    </span>
  );
}

// Podium is an async server component (not awaited at the call site -- React
// renders it like any other RSC) so the three Wikimedia lookups below can run
// in parallel with the rest of the page instead of blocking it.
async function Podium({ rows, gender, athleteSlugs }: { rows: MarkRow[]; gender: string; athleteSlugs: Map<string, string> }) {
  if (rows.length < 3) return null;
  const order = [rows[1], rows[0], rows[2]];
  const ring = ["border-neutral-300/50", "border-yellow-400/60", "border-orange-600/60"];
  const medal = ["🥈", "🥇", "🥉"];
  return (
    <section className="grid grid-cols-3 gap-3 sm:gap-5 items-end max-w-xl mx-auto mb-8">
      {order.map((r, i) => (
        <Link
          key={r.athlete_id}
          href={athleteHref(r.athlete_id, athleteSlugs)}
          className={`group flex flex-col rounded-xl border ${ring[i]} bg-neutral-900/60 overflow-hidden hover:bg-neutral-800`}
        >
          <span className={`relative w-full ${i === 1 ? "aspect-[3/4]" : "aspect-[4/5]"} bg-neutral-800`}>
            <PodiumPhoto name={r.display_name} gender={gender} nationality={r.nationality} />
            <span className="absolute top-1.5 left-1.5 text-xl sm:text-2xl drop-shadow">{medal[i]}</span>
          </span>
          <span className="px-2 py-2 text-center">
            <span className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold leading-tight">
              <Flag code={r.nationality} />
              <span className="truncate">{r.display_name}</span>
            </span>
            <span className="block font-mono text-orange-400 text-base sm:text-lg font-bold mt-0.5">{r.mark_display}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

function SideList({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1.5 px-1" title={help}>
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export default async function DisciplinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gender?: string; year?: string; age?: string; limit?: string; indoor?: string; nationality?: string; area?: string }>;
}) {
  const { slug } = await params;
  const event = eventFromSlug(slug);
  if (!event) notFound();

  const group = findGroup(event);
  const sp = await searchParams;
  const availableGenders = group
    ? (((group.events.Men as readonly string[]).includes(event) ? ["Men"] : []).concat(
        (group.events.Women as readonly string[]).includes(event) ? ["Women"] : []
      ) as ("Men" | "Women")[])
    : (["Men", "Women"] as const);
  const gender = (sp.gender as "Men" | "Women") && availableGenders.includes(sp.gender as "Men" | "Women") ? (sp.gender as "Men" | "Women") : availableGenders[0] ?? "Men";
  // Flat list across every group (no category selector): same "All
  // disciplines" single-dropdown convention as Rankings.
  const eventOptions = Array.from(new Set(EVENT_GROUPS.flatMap((g) => (g.events[gender].length ? g.events[gender] : g.events.Men) as readonly string[])));

  const yearParam = sp.year === "all" ? null : sp.year ? Number(sp.year) : null;
  const ageCategory = sp.age ?? "";
  const limit = sp.limit ? Number(sp.limit) : 10;
  const isRelay = isRelayEvent(event);
  const category = eventCategory(event);
  const indoorEligible = category !== "Road" && category !== "Cross Country" && !isRelay;
  // 60m/60mH are never contested outdoors as a serious event -- the
  // "outdoor" rows that exist for them are near-certainly indoor races a
  // source failed to flag as such (no "indoor" in the meet name, no
  // track_key), so defaulting to outdoor here hid the real all-time best
  // entirely (caught live: Christian Coleman's 6.34 WR missing, "best"
  // shown was 6.42). Default to indoor for these two; sp.indoor is still
  // an explicit override either way ("true" or "false", not just absent).
  const INDOOR_DEFAULT_EVENTS = ["60 Metres", "60 Metres Hurdles"];
  const indoor =
    indoorEligible &&
    (sp.indoor ? sp.indoor === "true" : INDOOR_DEFAULT_EVENTS.includes(event));
  const nationality = sp.nationality || undefined;
  const area = sp.area && sp.area in AREAS ? sp.area : undefined;

  const [allTime, years, yearBest, progression, nationalities] = await Promise.all([
    isRelay ? getEventAllTimeBestRelay(event, gender, limit) : getEventAllTimeBest(event, gender, limit, ageCategory || undefined, indoor, nationality, area),
    getEventAvailableYears(event, gender),
    yearParam == null
      ? Promise.resolve(null)
      : isRelay
      ? getEventYearBestMarksRelay(event, gender, yearParam, limit)
      : getEventYearBestMarks(event, gender, yearParam, limit, ageCategory || undefined, indoor, nationality, area),
    isRelay ? Promise.resolve([]) : getEventYearlyProgression(event, gender, ageCategory || undefined),
    isRelay ? Promise.resolve([]) : getAvailableNationalities(event, gender, "all"),
  ]);
  const [byArea, byCountry, tenure] = isRelay
    ? ([[], [], []] as [
        Awaited<ReturnType<typeof getEventBestByArea>>,
        Awaited<ReturnType<typeof getEventBestByCountry>>,
        Awaited<ReturnType<typeof getEventRecordTenure>>,
      ])
    : await Promise.all([
        getEventBestByArea(event, gender, indoor),
        getEventBestByCountry(event, gender, indoor, 10),
        getEventRecordTenure(event, gender, 10),
      ]);

  const tableRows = yearParam == null ? allTime : yearBest!;
  const athleteSlugs = isRelay
    ? new Map<string, string>()
    : await getAthleteSlugs([
        ...(allTime as MarkRow[]).map((m) => m.athlete_id),
        ...(tableRows as MarkRow[]).map((m) => m.athlete_id),
        ...byArea.map((m) => m.athlete_id),
        ...byCountry.map((m) => m.athlete_id),
        ...tenure.map((t) => t.athlete_id),
      ]);
  const fieldEvent = isFieldEvent(event);
  const bestEver = progression.reduce<(typeof progression)[number] | null>(
    (b, d) => (!b || (fieldEvent ? d.mark_value > b.mark_value : d.mark_value < b.mark_value) ? d : b),
    null
  );
  const bestPhoto = bestEver?.athlete ? await getAthletePhotoInfo(bestEver.athlete) : null;

  const baseHref = (over: { gender?: string; event?: string }) => {
    const q = new URLSearchParams();
    if ((over.gender ?? gender) !== availableGenders[0]) q.set("gender", over.gender ?? gender);
    const target = over.event ? eventSlug(over.event) : slug;
    const qs = q.toString();
    return `/disciplines/${target}${qs ? `?${qs}` : ""}`;
  };
  const filtersHref = `/disciplines/${slug}?gender=${gender}`;
  // Shared href builder for every filter row (limit/year/country/
  // continent): starts from the page's current filters, lets any one of
  // them be overridden -- so clicking "France" doesn't drop the selected
  // year, and changing the year doesn't drop "France".
  const buildHref = (over: { year?: string; limit?: number; nationality?: string | null; area?: string | null; age?: string | null }) => {
    const nextYear = over.year !== undefined ? over.year : yearParam != null ? String(yearParam) : "all";
    const q = new URLSearchParams({ gender });
    if (nextYear !== "all") q.set("year", nextYear);
    const nextAge = over.age === null ? "" : over.age ?? ageCategory;
    if (nextAge) q.set("age", nextAge);
    const nextLimit = over.limit ?? limit;
    if (nextLimit !== 10) q.set("limit", String(nextLimit));
    if (indoorEligible) q.set("indoor", String(indoor));
    const nextNationality = over.nationality === null ? undefined : over.nationality ?? nationality;
    if (nextNationality) q.set("nationality", nextNationality);
    const nextArea = over.area === null ? undefined : over.area ?? area;
    if (nextArea) q.set("area", nextArea);
    return `/disciplines/${slug}?${q.toString()}`;
  };
  const selectClass = "shrink-0 bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";
  const limitHref = (l: number) => buildHref({ limit: l });
  const countryHref = (code?: string) => buildHref({ nationality: code ?? null });
  const areaHref = (code?: string) => buildHref({ area: code ?? null });
  const yearHref = (y: string) => buildHref({ year: y });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        {/* Everything -- title, category pills, filters, podium, table,
            chart -- lives in the grid's left column, same as Rankings/Home,
            so the right-hand column starts flush with the page title
            instead of being pushed down below a full-width filter block. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold mb-4">Disciplines</h1>

            {/* Filters: two rows, same look as Rankings (pill-row, no
                submit -- every control navigates on change) -- row 1 picks
                WHICH discipline (gender/group/discipline/indoor), row 2
                narrows it (continent/nation/age). */}
            <div className="flex flex-col gap-2 mb-6">
              <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0">
                {availableGenders.length > 1 && (
                  <div className="shrink-0 flex rounded bg-neutral-800 p-0.5 text-xs">
                    {(["Men", "Women"] as const).map((g) => (
                      <Link key={g} href={baseHref({ gender: g })} className={`px-3 py-1.5 rounded ${g === gender ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}>
                        {g}
                      </Link>
                    ))}
                  </div>
                )}
                {indoorEligible && (
                  <LinkSelect
                    value={indoor ? "indoor" : "outdoor"}
                    className={selectClass}
                    options={[
                      { value: "outdoor", label: "Outdoor", href: `/disciplines/${slug}?gender=${gender}${yearParam != null ? `&year=${yearParam}` : ""}${ageCategory ? `&age=${ageCategory}` : ""}${limit !== 10 ? `&limit=${limit}` : ""}&indoor=false` },
                      { value: "indoor", label: "Indoor", href: `/disciplines/${slug}?gender=${gender}${yearParam != null ? `&year=${yearParam}` : ""}${ageCategory ? `&age=${ageCategory}` : ""}${limit !== 10 ? `&limit=${limit}` : ""}&indoor=true` },
                    ]}
                  />
                )}
                <LinkSelect
                  value={yearParam == null ? "all" : String(yearParam)}
                  className={selectClass}
                  options={[{ value: "all", label: "All-time", href: yearHref("all") }, ...years.map((y) => ({ value: String(y), label: String(y), href: yearHref(String(y)) }))]}
                />
              </div>
              <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0">
                <LinkSelect
                  value={event}
                  className={selectClass}
                  options={eventOptions.map((ev) => ({ value: ev, label: eventLabel(ev), href: baseHref({ event: ev }) }))}
                />
                {!isRelay && (
                  <LinkSelect
                    value={area ?? ""}
                    className={selectClass}
                    options={[
                      { value: "", label: "All areas", href: areaHref(undefined) },
                      ...Object.entries(AREAS).map(([code, name]) => ({ value: code, label: name, href: areaHref(code) })),
                    ]}
                  />
                )}
                {!isRelay && (
                  <LinkSelect
                    value={nationality ?? ""}
                    className={selectClass}
                    options={[
                      { value: "", label: "All nations", href: countryHref(undefined) },
                      ...nationalities.map((n) => ({ value: n.code, label: n.name, href: countryHref(n.code) })),
                    ]}
                  />
                )}
                <EventFilters year={yearParam ?? "all"} ageCategory={ageCategory} limit={limit} indoor={indoor} nationality={nationality} area={area} baseHref={filtersHref} />
                {(nationality || area || ageCategory) && (
                  <Link href={buildHref({ nationality: null, area: null, age: null })} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300">
                    clear
                  </Link>
                )}
              </div>
            </div>

            <Podium rows={isRelay ? [] : (allTime as MarkRow[])} gender={gender} athleteSlugs={athleteSlugs} />

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{eventLabel(event)} · Best Marks</h2>
            </div>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden mb-8">
              {isRelay
                ? (tableRows as RelayMarkRow[]).map((m, i) => <RelayMarkRowItem key={i} m={m} rank={i + 1} />)
                : (tableRows as MarkRow[]).map((m, i) => <MarkRowItem key={i} m={m} rank={i + 1} athleteSlugs={athleteSlugs} />)}
              {tableRows.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">No data.</div>}
            </div>
            <div className="flex items-center justify-end gap-2 mb-8">
              <span className="text-xs text-neutral-500">Show top:</span>
              <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
                {[10, 20, 100, 1000].map((l) => (
                  <Link
                    key={l}
                    href={limitHref(l)}
                    className={`px-2 py-1 rounded ${limit === l ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {progression.length >= 2 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Best Mark by Year</h2>
                <YearlyProgressionChart data={progression} isField={fieldEvent} recordPhoto={bestPhoto ? { url: bestPhoto.url, credit: photoCredit(bestPhoto) } : null} />
              </section>
            )}
          </div>

          {!isRelay && (
            <aside className="flex flex-col gap-6 min-w-0 w-full">
              <SideList title="Best by Continent" help="The fastest/farthest mark ever from each World Athletics area">
                {byArea.map((m) => (
                  <Link key={m.area} href={areaHref(m.area)} className="flex items-center justify-between px-1 py-1.5 hover:text-orange-400 gap-2">
                    <span className="text-sm min-w-0">
                      <span className="block text-neutral-500 text-[10px] uppercase tracking-wide truncate">{m.area_name}</span>
                      <span className="flex items-center gap-1 truncate">
                        <Flag code={m.nationality} />
                        <span className="truncate">{m.display_name}</span>
                      </span>
                    </span>
                    <span className="font-mono text-sm text-orange-400 shrink-0">{m.mark_display}</span>
                  </Link>
                ))}
                {byArea.length === 0 && <div className="px-1 py-2 text-sm text-neutral-500">No data.</div>}
              </SideList>

              <SideList title="Best by Country" help="The national record (best mark ever) of each country, fastest first">
                {byCountry.map((m, i) => (
                  <Link key={m.nationality ?? i} href={countryHref(m.nationality ?? undefined)} className="flex items-center justify-between px-1 py-1 hover:text-orange-400 gap-2">
                    <span className="flex items-center gap-1.5 text-sm min-w-0">
                      <span className="text-neutral-500 font-mono text-xs w-3.5 shrink-0">{i + 1}</span>
                      <Flag code={m.nationality} />
                      <span className="truncate">{m.nationality ?? "—"}</span>
                    </span>
                    <span className="font-mono text-sm text-orange-400 shrink-0">{m.mark_display}</span>
                  </Link>
                ))}
                {byCountry.length === 0 && <div className="px-1 py-2 text-sm text-neutral-500">No data.</div>}
              </SideList>

              <SideList title="Longest-Held Record" help="Years spent as the all-time #1 mark, summed across every stretch held (a record can change hands and come back)">
                {tenure.map((t, i) => (
                  <Link key={t.athlete_id} href={athleteHref(t.athlete_id, athleteSlugs)} className="flex items-center justify-between px-1 py-1 hover:text-orange-400 gap-2">
                    <span className="flex items-center gap-1.5 text-sm min-w-0">
                      <span className="text-neutral-500 font-mono text-xs w-3.5 shrink-0">{i + 1}</span>
                      <Flag code={t.nationality} />
                      <span className="truncate">{t.display_name}</span>
                    </span>
                    <span className="font-mono text-sm text-orange-400 shrink-0">{t.years_held}y</span>
                  </Link>
                ))}
                {tenure.length === 0 && <div className="px-1 py-2 text-sm text-neutral-500">No data.</div>}
              </SideList>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
