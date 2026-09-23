import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import YearSelect from "@/components/YearSelect";
import { getEventAllTimeBest, getEventYearBestMarks, getEventAvailableYears } from "@/lib/queries";
import { eventLabel, EVENT_GROUPS } from "@/lib/events";
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

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gender?: string; year?: string }>;
}) {
  const { slug } = await params;
  const event = eventFromSlug(slug);
  if (!event) notFound();

  const { gender: genderParam, year: yearParam } = await searchParams;
  const availableGenders = findGenders(event);
  const gender = (genderParam as "Men" | "Women") ?? availableGenders[0];
  const currentYear = new Date().getFullYear();
  const year = yearParam ? Number(yearParam) : currentYear;

  const [allTime, years, yearBest] = await Promise.all([
    getEventAllTimeBest(event, gender, 10),
    getEventAvailableYears(event, gender),
    getEventYearBestMarks(event, gender, year, 10),
  ]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{eventLabel(event)}</h1>
          {availableGenders.length > 1 && (
            <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
              {availableGenders.map((g) => (
                <Link
                  key={g}
                  href={`/events/${slug}?gender=${g}${yearParam ? `&year=${yearParam}` : ""}`}
                  className={`px-3 py-1.5 rounded ${g === gender ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                >
                  {g}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              All-Time Best
            </h2>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
              {allTime.map((m, i) => (
                <Link
                  key={i}
                  href={`/athletes/${m.athlete_id}`}
                  className="flex items-center justify-between px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800"
                >
                  <span className="text-sm flex items-center gap-2 truncate">
                    <span className="text-neutral-500 font-mono text-xs w-4">{i + 1}</span>
                    <Flag code={m.nationality} />
                    {m.display_name}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {m.record === "WR" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">
                        WR
                      </span>
                    )}
                    <span className="font-mono text-sm text-orange-400">{m.mark_display}</span>
                  </span>
                </Link>
              ))}
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
                baseHref={`/events/${slug}?gender=${gender}`}
              />
            </div>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
              {yearBest.map((m, i) => (
                <Link
                  key={i}
                  href={`/athletes/${m.athlete_id}`}
                  className="flex items-center justify-between px-4 py-2 bg-neutral-900/40 hover:bg-neutral-800"
                >
                  <span className="text-sm flex items-center gap-2 truncate">
                    <span className="text-neutral-500 font-mono text-xs w-4">{i + 1}</span>
                    <Flag code={m.nationality} />
                    {m.display_name}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {m.record === "WR" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">
                        WR
                      </span>
                    )}
                    <span className="font-mono text-sm text-orange-400">{m.mark_display}</span>
                  </span>
                </Link>
              ))}
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
