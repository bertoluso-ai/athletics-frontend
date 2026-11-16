import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Flag from "@/components/Flag";
import JsonLd, { SITE_URL, breadcrumbs } from "@/components/JsonLd";
import { eventFromSlug } from "@/lib/slugs";
import { EVENT_GROUPS, groupEvents, eventLabel, isRelayEvent, isFieldEvent, type EventGender } from "@/lib/events";
import { isIndoorOnlyEvent } from "@/lib/raceTypes";
import { getEventAllTimeBest, getEventYearlyProgression, getAthleteSlugs, athleteHref } from "@/lib/queries";
import { countryName } from "@/lib/flags";

// Una prueba y un genero ("100 m femenino"): lista historica de todos los tiempos, mejor marca de cada temporada y evolucion de la
// mejor marca del mundo. Pagina indexable propia (el genero ya no va como parametro). Datos de nuestra base, no marcas homologadas.
export const revalidate = 3600;

const FIRST_SEASON = 1990;

function resolve(slug: string, genderSlug: string) {
  const event = eventFromSlug(slug);
  const gender = genderSlug === "men" ? "Men" : genderSlug === "women" ? "Women" : null;
  if (!event || !gender || isRelayEvent(event)) return null;
  const group = EVENT_GROUPS.find((g) => (groupEvents(g, gender as EventGender) as readonly string[]).includes(event));
  if (!group) return null;
  return { event, gender, indoor: isIndoorOnlyEvent(event) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; gender: string }> }): Promise<Metadata> {
  const { slug, gender: gs } = await params;
  const r = resolve(slug, gs);
  if (!r) return { title: "Discipline" };
  const who = r.gender === "Men" ? "Men's" : "Women's";
  const label = eventLabel(r.event);
  const top = (await getEventAllTimeBest(r.event, r.gender, 1, undefined, r.indoor))[0];
  const best = top ? ` Best ever: ${top.display_name} (${top.mark_display}).` : "";
  const title = `${who} ${label} - all-time list, year by year and world best progression`;
  const description = `${who} ${label}: the best performances of all time, the best mark of every season and how the world best has evolved.${best}`;
  return { title, description, alternates: { canonical: `/disciplines/${slug}/${gs}` }, openGraph: { title, description, images: ["/opengraph-image"] } };
}

export default async function DisciplineGenderPage({ params }: { params: Promise<{ slug: string; gender: string }> }) {
  const { slug, gender: gs } = await params;
  const r = resolve(slug, gs);
  if (!r) notFound();
  const label = eventLabel(r.event);
  const who = r.gender === "Men" ? "Men's" : "Women's";
  const [allTime, yearly] = await Promise.all([getEventAllTimeBest(r.event, r.gender, 50, undefined, r.indoor), getEventYearlyProgression(r.event, r.gender)]);
  if (allTime.length === 0 && yearly.length === 0) notFound();

  // Evolucion de la mejor marca: cada año en que la mejor marca de la historia mejoro
  const field = isFieldEvent(r.event);
  let bestSoFar: number | null = null;
  const progression = yearly.filter((p) => {
    if (p.mark_value == null) return false;
    const better = bestSoFar === null || (field ? p.mark_value > bestSoFar : p.mark_value < bestSoFar);
    if (better) bestSoFar = p.mark_value;
    return better;
  });
  const seasons = [...yearly].sort((a, b) => b.year - a.year);
  const slugs = await getAthleteSlugs([...allTime.map((m) => m.athlete_id), ...yearly.map((p) => p.athlete_id).filter((x): x is string => !!x)]);
  const other = r.gender === "Men" ? "women" : "men";
  const thisYear = new Date().getFullYear();
  const seasonYears = new Set(seasons.map((s) => s.year));
  const linkYears = Array.from({ length: thisYear - FIRST_SEASON + 1 }, (_, i) => thisYear - i).filter((y) => seasonYears.has(y));
  const href = (id: string | null | undefined) => (id ? athleteHref(id, slugs) : "#");

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <JsonLd
        data={[
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Disciplines", path: "/disciplines" },
            { name: label, path: `/disciplines/${slug}` },
            { name: r.gender, path: `/disciplines/${slug}/${gs}` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${who} ${label} all-time list`,
            itemListElement: allTime.slice(0, 10).map((m, k) => ({ "@type": "ListItem", position: k + 1, name: `${m.display_name} - ${m.mark_display}`, url: `${SITE_URL}${athleteHref(m.athlete_id, slugs)}` })),
          },
        ]}
      />
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <Link href={`/disciplines/${slug}`} className="text-xs text-neutral-500 hover:text-neutral-300">← {label}: filters and charts</Link>
        <h1 className="text-2xl lg:text-3xl font-bold mt-2 mb-1">{who} {label}: all-time list and year by year</h1>
        <p className="text-sm text-neutral-500 mb-5">
          Best performances of all time{r.indoor ? " (indoor)" : " (outdoor, legal wind)"}, best mark of every season and evolution of the world best. Figures are the best marks in our database, not ratified records.{" "}
          <Link href={`/disciplines/${slug}/${other}`} className="text-orange-400 hover:underline">{other === "men" ? "Men" : "Women"}&apos;s {label} →</Link>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section>
            <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">All-time top {allTime.length}</h2>
            <ol className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
              {allTime.map((m, k) => (
                <li key={`${m.athlete_id}-${k}`} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="w-7 text-right tabular-nums text-neutral-500">{k + 1}</span>
                  <Flag code={m.nationality} />
                  <Link href={athleteHref(m.athlete_id, slugs)} className="flex-1 truncate hover:text-orange-400" title={countryName(m.nationality) ?? undefined}>{m.display_name}</Link>
                  <span className="font-mono font-semibold text-orange-400">{m.mark_display}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-col gap-6">
            <section>
              <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">World best progression</h2>
              <ul className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                {[...progression].reverse().map((p) => (
                  <li key={p.year} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className="w-12 tabular-nums text-neutral-500">{p.year}</span>
                    <Flag code={p.nationality} />
                    <Link href={href(p.athlete_id)} className="flex-1 truncate hover:text-orange-400">{p.athlete}</Link>
                    <span className="font-mono font-semibold text-orange-400">{p.mark_display}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">Best mark of each season</h2>
              <ul className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                {seasons.map((p) => (
                  <li key={p.year} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <Link href={`/disciplines/${slug}/${gs}/${p.year}`} className="w-12 tabular-nums text-neutral-400 hover:text-orange-400">{p.year}</Link>
                    <Flag code={p.nationality} />
                    <Link href={href(p.athlete_id)} className="flex-1 truncate hover:text-orange-400">{p.athlete}</Link>
                    <span className="font-mono font-semibold text-orange-400">{p.mark_display}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {linkYears.length > 0 && (
          <nav aria-label="Seasons" className="mt-8">
            <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">{who} {label} season rankings and winners</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {linkYears.map((y) => (
                <Link key={y} href={`/disciplines/${slug}/${gs}/${y}`} className="text-neutral-400 hover:text-neutral-200">{y}</Link>
              ))}
            </div>
          </nav>
        )}
      </main>
    </div>
  );
}
