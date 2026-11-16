import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Flag from "@/components/Flag";
import JsonLd, { breadcrumbs } from "@/components/JsonLd";
import { EVENT_GROUPS, groupEvents, eventLabel, isFieldEvent, isRelayEvent, type EventGender } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import { getCountryAllTimeBests, getAthleteSlugs, athleteHref } from "@/lib/queries";
import { countryName } from "@/lib/flags";

// "Mejores marcas de <pais> en atletismo": la mejor marca historica de cada prueba, hombres y mujeres. Pagina indexable para busquedas
// tipo "record de Espana 100 metros". Ojo: son las mejores marcas de nuestra base, no los records nacionales homologados.
export const revalidate = 3600;

function catalog() {
  const track: string[] = [];
  const field: string[] = [];
  const byGender: Record<"Men" | "Women", string[]> = { Men: [], Women: [] };
  for (const g of EVENT_GROUPS) {
    if (g.key === "relays" || g.key === "combined") continue; // relevos y combinadas: otra presentacion
    for (const gender of ["Men", "Women"] as const) {
      for (const e of groupEvents(g, gender as EventGender)) {
        if (isRelayEvent(e)) continue;
        if (!byGender[gender].includes(e)) byGender[gender].push(e);
        const list = isFieldEvent(e) ? field : track;
        if (!list.includes(e)) list.push(e);
      }
    }
  }
  return { track, field, byGender };
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const name = countryName(code.toUpperCase());
  if (!name) return { title: "Country bests" };
  const title = `${name} athletics - all-time best marks by event`;
  const description = `The best performance ever by an athlete from ${name} in every athletics event, men and women: sprints, middle and long distance, hurdles, jumps and throws.`;
  return { title, description, alternates: { canonical: `/countries/${code.toLowerCase()}/records` }, openGraph: { title, description, images: ["/opengraph-image"] } };
}

export default async function CountryRecordsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const name = countryName(code);
  if (!name || name === code) notFound();
  const cat = catalog();
  const rows = await getCountryAllTimeBests(code, cat.track, cat.field);
  if (rows.length === 0) notFound();
  const slugs = await getAthleteSlugs(rows.map((r) => r.athlete_id));
  const order = (e: string) => EVENT_GROUPS.flatMap((g) => groupEvents(g, "Men")).indexOf(e);

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <JsonLd data={breadcrumbs([{ name: "Home", path: "/" }, { name: "Countries", path: "/countries" }, { name, path: `/countries/${code.toLowerCase()}` }, { name: "All-time bests", path: `/countries/${code.toLowerCase()}/records` }])} />
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <Link href={`/countries/${code.toLowerCase()}`} className="text-xs text-neutral-500 hover:text-neutral-300">← {name}</Link>
        <h1 className="text-2xl lg:text-3xl font-bold mt-2 mb-1 flex items-center gap-3">
          <Flag code={code} className="w-7 h-5" /> {name}: all-time best marks
        </h1>
        <p className="text-sm text-neutral-500 mb-5">
          Best performance ever by an athlete of {name} in each event (outdoor, legal wind). These are the best marks in our database, not the officially ratified national records.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {(["Men", "Women"] as const).map((gender) => {
            const list = rows.filter((r) => r.gender === gender && cat.byGender[gender].includes(r.athletics_event)).sort((a, b) => order(a.athletics_event) - order(b.athletics_event));
            return (
              <section key={gender}>
                <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">{gender}</h2>
                {list.length === 0 ? (
                  <p className="text-sm text-neutral-500 px-2">No marks recorded.</p>
                ) : (
                  <ul className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                    {list.map((r) => (
                      <li key={r.athletics_event} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                        <Link href={`/disciplines/${eventSlug(r.athletics_event)}`} className="w-40 shrink-0 text-neutral-400 hover:text-orange-400 truncate">{eventLabel(r.athletics_event)}</Link>
                        <Link href={athleteHref(r.athlete_id, slugs)} className="flex-1 truncate hover:text-orange-400">{r.display_name}</Link>
                        <span className="text-xs text-neutral-500 tabular-nums">{r.year ?? ""}</span>
                        <span className="font-mono font-semibold text-orange-400">{r.mark_display}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
