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
  type MarkRow, type RelayMarkRow,
} from "@/lib/queries";
import { eventLabel, EVENT_GROUPS, isRelayEvent, isFieldEvent, eventCategory } from "@/lib/events";
import { eventSlug, eventFromSlug } from "@/lib/slugs";

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

function MarkRowItem({ m, rank }: { m: MarkRow; rank: number }) {
  return (
    <Link href={`/athletes/${m.athlete_id}`} className="flex items-center justify-between px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800">
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

function Podium({ rows, gender }: { rows: MarkRow[]; gender: string }) {
  if (rows.length < 3) return null;
  const order = [rows[1], rows[0], rows[2]];
  const ring = ["border-neutral-300/50", "border-yellow-400/60", "border-orange-600/60"];
  const medal = ["🥈", "🥇", "🥉"];
  return (
    <section className="grid grid-cols-3 gap-3 sm:gap-5 items-end max-w-xl mx-auto mb-8">
      {order.map((r, i) => (
        <Link
          key={r.athlete_id}
          href={`/athletes/${r.athlete_id}`}
          className={`group flex flex-col rounded-xl border ${ring[i]} bg-neutral-900/60 overflow-hidden hover:bg-neutral-800`}
        >
          <span className={`relative w-full ${i === 1 ? "aspect-[3/4]" : "aspect-[4/5]"} bg-neutral-800`}>
            <GenericAthlete name={r.display_name} gender={gender} nationality={r.nationality} />
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
  searchParams: Promise<{ gender?: string; year?: string; age?: string; limit?: string; indoor?: string }>;
}) {
  const { slug } = await params;
  const event = eventFromSlug(slug);
  if (!event) notFound();

  const group = findGroup(event);
  const sp = await searchParams;
  const availableGenders = group
    ? ((group.events.Men.includes(event) ? ["Men"] : []).concat(group.events.Women.includes(event) ? ["Women"] : []) as ("Men" | "Women")[])
    : (["Men", "Women"] as const);
  const gender = (sp.gender as "Men" | "Women") && availableGenders.includes(sp.gender as "Men" | "Women") ? (sp.gender as "Men" | "Women") : availableGenders[0] ?? "Men";
  const eventOptions = group ? ((group.events[gender].length ? group.events[gender] : group.events.Men) as readonly string[]) : [event];

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

  const [allTime, years, yearBest, progression] = await Promise.all([
    isRelay ? getEventAllTimeBestRelay(event, gender, limit) : getEventAllTimeBest(event, gender, limit, ageCategory || undefined, indoor),
    getEventAvailableYears(event, gender),
    yearParam == null
      ? Promise.resolve(null)
      : isRelay
      ? getEventYearBestMarksRelay(event, gender, yearParam, limit)
      : getEventYearBestMarks(event, gender, yearParam, limit, ageCategory || undefined, indoor),
    isRelay ? Promise.resolve([]) : getEventYearlyProgression(event, gender, ageCategory || undefined),
  ]);
  const [byArea, byCountry, tenure] = isRelay
    ? ([[], [], []] as [
        Awaited<ReturnType<typeof getEventBestByArea>>,
        Awaited<ReturnType<typeof getEventBestByCountry>>,
        Awaited<ReturnType<typeof getEventRecordTenure>>,
      ])
    : await Promise.all([
        getEventBestByArea(event, gender, indoor),
        getEventBestByCountry(event, gender, indoor, 12),
        getEventRecordTenure(event, gender, 10),
      ]);

  const tableRows = yearParam == null ? allTime : yearBest!;
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
  const yearHref = (y: string) => {
    const q = new URLSearchParams({ gender, ...(y !== "all" ? { year: y } : {}) });
    if (ageCategory) q.set("age", ageCategory);
    if (limit !== 10) q.set("limit", String(limit));
    // Always explicit, never just omitted: some events (60m/60mH) default
    // to indoor, so omitting a "false" here would silently flip back to
    // that default instead of staying on whatever the page is showing.
    if (indoorEligible) q.set("indoor", String(indoor));
    return `/disciplines/${slug}?${q.toString()}`;
  };

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

            <div className="pill-row flex flex-nowrap overflow-x-auto gap-2 mb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
              {EVENT_GROUPS.map((g) => {
                const firstEvent = (g.events[gender].length ? g.events[gender] : g.events.Men)[0];
                return (
                  <Link
                    key={g.key}
                    href={`/disciplines/${eventSlug(firstEvent)}?gender=${gender}`}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-full border ${
                      g === group ? "bg-neutral-100 text-black border-neutral-100" : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {g.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {availableGenders.length > 1 && (
                  <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
                    {(["Men", "Women"] as const).map((g) => (
                      <Link key={g} href={baseHref({ gender: g })} className={`px-3 py-1.5 rounded ${g === gender ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}>
                        {g}
                      </Link>
                    ))}
                  </div>
                )}
                {group && (
                  <LinkSelect value={event} options={eventOptions.map((ev) => ({ value: ev, label: eventLabel(ev), href: baseHref({ event: ev }) }))} />
                )}
              </div>
              <EventFilters year={yearParam ?? "all"} ageCategory={ageCategory} limit={limit} indoor={indoor} baseHref={filtersHref} />
            </div>

            <div className="flex items-center justify-end gap-2 mb-3">
              {indoorEligible && (
                <Link
                  href={`/disciplines/${slug}?gender=${gender}${yearParam != null ? `&year=${yearParam}` : ""}${ageCategory ? `&age=${ageCategory}` : ""}${limit !== 10 ? `&limit=${limit}` : ""}&indoor=${!indoor}`}
                  title="Indoor and outdoor marks are separate ranking contexts in the sport (separate world records exist) -- never blended together here"
                  className={`text-[10px] px-2 py-1 rounded-full border ${indoor ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "border-neutral-700 text-neutral-400"}`}
                >
                  {indoor ? "Indoor" : "Outdoor"}
                </Link>
              )}
              <span className="text-xs text-neutral-500">Show top:</span>
              <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
                {[10, 20, 100].map((l) => (
                  <Link
                    key={l}
                    href={`/disciplines/${slug}?gender=${gender}${yearParam != null ? `&year=${yearParam}` : ""}${ageCategory ? `&age=${ageCategory}` : ""}${l !== 10 ? `&limit=${l}` : ""}&indoor=${indoor}`}
                    className={`px-2 py-1 rounded ${limit === l ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            <Podium rows={isRelay ? [] : (allTime as MarkRow[])} gender={gender} />

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{eventLabel(event)} · Best Marks</h2>
              <LinkSelect
                value={yearParam == null ? "all" : String(yearParam)}
                options={[{ value: "all", label: "All-time", href: yearHref("all") }, ...years.map((y) => ({ value: String(y), label: String(y), href: yearHref(String(y)) }))]}
              />
            </div>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden mb-8">
              {isRelay
                ? (tableRows as RelayMarkRow[]).map((m, i) => <RelayMarkRowItem key={i} m={m} rank={i + 1} />)
                : (tableRows as MarkRow[]).map((m, i) => <MarkRowItem key={i} m={m} rank={i + 1} />)}
              {tableRows.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">No data.</div>}
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
                  <Link key={m.area} href={`/athletes/${m.athlete_id}`} className="flex items-center justify-between px-1 py-1.5 hover:text-orange-400 gap-2">
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
                  <Link key={m.nationality ?? i} href={`/athletes/${m.athlete_id}`} className="flex items-center justify-between px-1 py-1 hover:text-orange-400 gap-2">
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
                  <Link key={t.athlete_id} href={`/athletes/${t.athlete_id}`} className="flex items-center justify-between px-1 py-1 hover:text-orange-400 gap-2">
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
