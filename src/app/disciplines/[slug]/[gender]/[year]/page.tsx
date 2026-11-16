import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import Flag from "@/components/Flag";
import JsonLd, { SITE_URL, breadcrumbs } from "@/components/JsonLd";
import { eventFromSlug } from "@/lib/slugs";
import { EVENT_GROUPS, groupEvents, eventLabel, isRelayEvent, TIER_LABELS, tierPriority, type EventGender } from "@/lib/events";
import { isIndoorOnlyEvent } from "@/lib/raceTypes";
import { getEventYearBestMarks, getAthleteSlugs, athleteHref, getMajorWinners, type MarkRow } from "@/lib/queries";
import { countryName } from "@/lib/flags";

// Ranking de temporada de una prueba y genero ("100 m masculino 2024"): la mejor marca de cada atleta ese año + los ganadores de las
// competiciones de nivel B o superior. Pagina indexable propia (la de /disciplines/<prueba>?year=... lleva canonica a la prueba).
export const revalidate = 3600;

const FIRST_YEAR = 1990;
const TOP = 50;

const seasonList = unstable_cache(
  async (event: string, gender: string, year: number, indoor: boolean): Promise<MarkRow[]> => getEventYearBestMarks(event, gender, year, TOP, undefined, indoor),
  ["season-ranking-v2"],
  { revalidate: 3600 }
);

function resolve(slug: string, genderSlug: string, yearStr: string) {
  const event = eventFromSlug(slug);
  const gender = genderSlug === "men" ? "Men" : genderSlug === "women" ? "Women" : null;
  const year = /^\d{4}$/.test(yearStr) ? Number(yearStr) : NaN;
  if (!event || !gender || isRelayEvent(event) || !(year >= FIRST_YEAR && year <= new Date().getFullYear())) return null;
  const group = EVENT_GROUPS.find((g) => (groupEvents(g, gender as EventGender) as readonly string[]).includes(event));
  if (!group) return null;
  return { event, gender, year, indoor: isIndoorOnlyEvent(event) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; gender: string; year: string }> }): Promise<Metadata> {
  const { slug, gender: gs, year: ys } = await params;
  const r = resolve(slug, gs, ys);
  if (!r) return { title: "Season ranking" };
  const label = eventLabel(r.event);
  const list = await seasonList(r.event, r.gender, r.year, r.indoor);
  const leader = list[0] ? ` Leader: ${list[0].display_name} (${list[0].mark_display}).` : "";
  const who = r.gender === "Men" ? "Men's" : "Women's";
  const title = `${who} ${label} ${r.year} - season ranking and winners`;
  const description = `${who} ${label} in ${r.year}: world ranking of the best marks of the season and the winners of the top competitions.${leader}`;
  return { title, description, alternates: { canonical: `/disciplines/${slug}/${gs}/${r.year}` }, openGraph: { title, description, images: ["/opengraph-image"] } };
}

export default async function SeasonPage({ params }: { params: Promise<{ slug: string; gender: string; year: string }> }) {
  const { slug, gender: gs, year: ys } = await params;
  const r = resolve(slug, gs, ys);
  if (!r) notFound();
  const label = eventLabel(r.event);
  const who = r.gender === "Men" ? "Men's" : "Women's";
  const [list, winners] = await Promise.all([seasonList(r.event, r.gender, r.year, r.indoor), getMajorWinners(r.event, r.gender, r.year)]);
  if (list.length === 0 && winners.length === 0) notFound();
  const slugs = await getAthleteSlugs([...list.map((m) => m.athlete_id), ...winners.map((w) => w.athlete_id)]);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);
  const other = r.gender === "Men" ? "women" : "men";
  const tierLabel = (t: string) => TIER_LABELS.find((x) => x.value === t)?.label ?? t;
  const sortedWinners = [...winners].sort((a, b) => tierPriority(a.tier) - tierPriority(b.tier) || (a.date ?? "").localeCompare(b.date ?? ""));

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <JsonLd
        data={[
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Disciplines", path: "/disciplines" },
            { name: label, path: `/disciplines/${slug}` },
            { name: r.gender, path: `/disciplines/${slug}/${gs}` },
            { name: String(r.year), path: `/disciplines/${slug}/${gs}/${r.year}` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${who} ${label} ${r.year} season ranking`,
            itemListElement: list.slice(0, 10).map((m, k) => ({
              "@type": "ListItem",
              position: k + 1,
              name: `${m.display_name} - ${m.mark_display}`,
              url: `${SITE_URL}${athleteHref(m.athlete_id, slugs)}`,
            })),
          },
        ]}
      />
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <Link href={`/disciplines/${slug}/${gs}`} className="text-xs text-neutral-500 hover:text-neutral-300">← {who} {label}: all-time list and year by year</Link>
        <h1 className="text-2xl lg:text-3xl font-bold mt-2 mb-1">{who} {label} {r.year}: season ranking</h1>
        <p className="text-sm text-neutral-500 mb-5">
          The best mark of each athlete in {r.year}{r.indoor ? " (indoor)" : " (outdoor, legal wind)"}, and the winners of the top competitions of the year.{" "}
          <Link href={`/disciplines/${slug}/${other}/${r.year}`} className="text-orange-400 hover:underline">{other === "men" ? "Men" : "Women"}&apos;s {r.year} →</Link>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section>
            <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">Top {TOP} of the season</h2>
            {list.length === 0 ? (
              <p className="text-sm text-neutral-500 px-2">No marks recorded.</p>
            ) : (
              <ol className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                {list.map((m, k) => (
                  <li key={m.athlete_id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className="w-7 text-right tabular-nums text-neutral-500">{k + 1}</span>
                    <Flag code={m.nationality} />
                    <Link href={athleteHref(m.athlete_id, slugs)} className="flex-1 truncate hover:text-orange-400" title={countryName(m.nationality) ?? undefined}>{m.display_name}</Link>
                    <span className="font-mono font-semibold text-orange-400">{m.mark_display}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">Winners of top competitions (tier B and above)</h2>
            {sortedWinners.length === 0 ? (
              <p className="text-sm text-neutral-500 px-2">No winners recorded for this season.</p>
            ) : (
              <ul className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                {sortedWinners.slice(0, 80).map((w) => (
                  <li key={w.event_name} className="flex flex-col gap-0.5 px-3 py-1.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Flag code={w.nationality} />
                      <Link href={athleteHref(w.athlete_id, slugs)} className="flex-1 truncate font-semibold hover:text-orange-400">{w.display_name}</Link>
                      <span className="font-mono text-orange-400">{w.mark_display}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-neutral-500">
                      <Link href={`/meets/${encodeURIComponent(w.event_name)}?year=${r.year}`} className="truncate hover:text-neutral-300">{w.event_name}</Link>
                      <span className="shrink-0">· {tierLabel(w.tier)}{w.date ? ` · ${w.date.slice(0, 10)}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <nav aria-label="Other seasons" className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">{who} {label} by season</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {years.map((y) => (
              <Link key={y} href={`/disciplines/${slug}/${gs}/${y}`} className={y === r.year ? "font-bold text-orange-400" : "text-neutral-400 hover:text-neutral-200"}>{y}</Link>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
}
