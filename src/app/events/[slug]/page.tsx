import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import EventFilters from "@/components/EventFilters";
import YearSelect from "@/components/YearSelect";
import YearlyProgressionChart from "@/components/YearlyProgressionChart";
import {
  getEventAllTimeBest, getEventYearBestMarks, getEventAvailableYears,
  getEventAllTimeBestRelay, getEventYearBestMarksRelay,
  getEventYearlyProgression,
  type MarkRow, type RelayMarkRow,
} from "@/lib/queries";
import { eventLabel, EVENT_GROUPS, isRelayEvent, isFieldEvent, eventCategory } from "@/lib/events";
import { eventFromSlug } from "@/lib/slugs";

export const revalidate = 3600;

function findGenders(event: string): ("Men" | "Women")[] {
  const genders: ("Men" | "Women")[] = [];
  for (const g of EVENT_GROUPS) {
    if ((g.events.Men as readonly string[]).includes(event)) genders.push("Men");
    if ((g.events.Women as readonly string[]).includes(event)) genders.push("Women");
  }
  return genders.length ? genders : ["Men", "Women"];
}

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function MarkRowItem({ m, rank }: { m: MarkRow; rank: number }) {
  return (
    <Link
      href={`/athletes/${m.athlete_id}`}
      className="flex items-center justify-between px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800"
    >
      <span className="text-sm flex items-center gap-2 min-w-0">
        <span className="text-neutral-500 font-mono text-xs w-4 shrink-0">{rank}</span>
        <Flag code={m.nationality} />
        <span className="truncate">{m.display_name}</span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {m.record === "WR" && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
        )}
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
          <span className="text-neutral-500 font-normal ml-2 text-xs">
            {m.roster.map(lastName).join(" · ")}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {m.record === "WR" && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
        )}
        <span className="font-mono text-sm text-orange-400">{m.mark_display}</span>
      </span>
    </div>
  );
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gender?: string; year?: string; age?: string; limit?: string; indoor?: string }>;
}) {
  const { slug } = await params;
  const event = eventFromSlug(slug);
  if (!event) notFound();

  const { gender: genderParam, year: yearParam, age: ageParam, limit: limitParam, indoor: indoorParam } = await searchParams;
  const availableGenders = findGenders(event);
  const gender = (genderParam as "Men" | "Women") ?? availableGenders[0];
  const currentYear = new Date().getFullYear();
  const year = yearParam ? Number(yearParam) : currentYear;
  const ageCategory = ageParam ?? "";
  const limit = limitParam ? Number(limitParam) : 10;
  const isRelay = isRelayEvent(event);
  // Indoor/outdoor never applies to Road or Cross Country -- those are
  // always outdoor by nature, so the toggle is hidden for them below.
  const category = eventCategory(event);
  const indoorEligible = category !== "Road" && category !== "Cross Country" && !isRelay;
  const indoor = indoorEligible && indoorParam === "true";

  const [allTime, years, yearBest, progression] = await Promise.all([
    isRelay
      ? getEventAllTimeBestRelay(event, gender, limit)
      : getEventAllTimeBest(event, gender, limit, ageCategory || undefined, indoor),
    getEventAvailableYears(event, gender),
    isRelay
      ? getEventYearBestMarksRelay(event, gender, year, limit)
      : getEventYearBestMarks(event, gender, year, limit, ageCategory || undefined, indoor),
    isRelay ? Promise.resolve([]) : getEventYearlyProgression(event, gender, ageCategory || undefined),
  ]);

  const extraParams = `${ageCategory ? `&age=${ageCategory}` : ""}${limit !== 10 ? `&limit=${limit}` : ""}${indoor ? "&indoor=true" : ""}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{eventLabel(event)}</h1>
          <div className="flex items-center gap-2">
            {availableGenders.length > 1 && (
              <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
                {availableGenders.map((g) => (
                  <Link
                    key={g}
                    href={`/events/${slug}?gender=${g}&year=${year}${extraParams}`}
                    className={`px-3 py-1.5 rounded ${g === gender ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                  >
                    {g}
                  </Link>
                ))}
              </div>
            )}
            <EventFilters
              year={year}
              ageCategory={ageCategory}
              limit={limit}
              indoor={indoor}
              baseHref={`/events/${slug}?gender=${gender}`}
            />
          </div>
        </div>

        {progression.length >= 2 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              Best Mark by Year
            </h2>
            <YearlyProgressionChart data={progression} isField={isFieldEvent(event)} />
          </section>
        )}

        <div className="flex items-center justify-end gap-2 mb-3">
          {indoorEligible && (
            <Link
              href={`/events/${slug}?gender=${gender}&year=${year}${ageCategory ? `&age=${ageCategory}` : ""}${limit !== 10 ? `&limit=${limit}` : ""}${!indoor ? "&indoor=true" : ""}`}
              title="Indoor and outdoor marks are separate ranking contexts in the sport (separate world records exist) -- never blended together here"
              className={`text-[10px] px-2 py-1 rounded-full border ${
                indoor
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  : "border-neutral-700 text-neutral-400"
              }`}
            >
              {indoor ? "Indoor" : "Outdoor"}
            </Link>
          )}
          <span className="text-xs text-neutral-500">Show top:</span>
          <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
            {[10, 20, 100].map((l) => (
              <Link
                key={l}
                href={`/events/${slug}?gender=${gender}&year=${year}${ageCategory ? `&age=${ageCategory}` : ""}${l !== 10 ? `&limit=${l}` : ""}${indoor ? "&indoor=true" : ""}`}
                className={`px-2 py-1 rounded ${limit === l ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              All-Time Best
            </h2>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
              {isRelay
                ? (allTime as RelayMarkRow[]).map((m, i) => <RelayMarkRowItem key={i} m={m} rank={i + 1} />)
                : (allTime as MarkRow[]).map((m, i) => <MarkRowItem key={i} m={m} rank={i + 1} />)}
              {allTime.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">No data.</div>}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Best of {year}
              </h2>
              <YearSelect
                years={years.includes(year) ? years : [year, ...years]}
                year={year}
                baseHref={`/events/${slug}?gender=${gender}${ageCategory ? `&age=${ageCategory}` : ""}${limit !== 10 ? `&limit=${limit}` : ""}${indoor ? "&indoor=true" : ""}`}
              />
            </div>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
              {isRelay
                ? (yearBest as RelayMarkRow[]).map((m, i) => <RelayMarkRowItem key={i} m={m} rank={i + 1} />)
                : (yearBest as MarkRow[]).map((m, i) => <MarkRowItem key={i} m={m} rank={i + 1} />)}
              {yearBest.length === 0 && (
                <div className="px-4 py-4 text-sm text-neutral-500">No results in {year}.</div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
