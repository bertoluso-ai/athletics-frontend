import type { Metadata } from "next";
import Link from "next/link";
import Flag from "@/components/Flag";
import JsonLd, { breadcrumbs } from "@/components/JsonLd";
import { eventSlug, eventFromSlug } from "@/lib/slugs";
import wr from "@/data/world-records.json";

// Records del mundo vigentes de atletismo, hombres y mujeres: pista al aire libre, ruta, pista cubierta y relevos.
// Datos: lista de Wikipedia "List of world records in athletics" (CC BY-SA 4.0), regenerados con scripts/build-world-records.py.
// La pagina de Wikipedia incluye marcas pendientes de homologar; se enlaza para consultar su estado.
export const metadata: Metadata = {
  title: "World records in athletics - men and women, outdoor, indoor, road and relays",
  description: "Current athletics world records for men and women in every event: sprints, middle and long distance, hurdles, jumps, throws, combined events, road running, indoor and relays.",
  alternates: { canonical: "/records" },
  openGraph: { title: "World records in athletics", description: "Current athletics world records for men and women in every event.", images: ["/opengraph-image"] },
};

type Rec = { gender: "Men" | "Women"; event: string; kind: "outdoor" | "road" | "indoor" | "relay"; canonical: string | null; perf: string; athlete: string; nat: string; date: string; meeting: string; location: string; country: string };
const records = wr.records as Rec[];

const SECTIONS: { kind: Rec["kind"]; title: string }[] = [
  { kind: "outdoor", title: "Track and field (outdoor)" },
  { kind: "road", title: "Road and walking" },
  { kind: "indoor", title: "Indoor" },
  { kind: "relay", title: "Relays" },
];

function where(r: Rec) {
  return [r.meeting, r.location, r.country].filter(Boolean).join(", ");
}

export default function RecordsPage() {
  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <JsonLd data={breadcrumbs([{ name: "Home", path: "/" }, { name: "World records", path: "/records" }])} />
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <h1 className="text-2xl lg:text-3xl font-bold mb-1">World records in athletics</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Current world records for men and women. Source:{" "}
          <a href={wr.source} className="text-orange-400 hover:underline" rel="noopener">Wikipedia, List of world records in athletics</a> (CC BY-SA 4.0); it also lists marks pending ratification, so check there for the status of the latest ones.
          Click an event for its all-time list and the evolution of the best mark.
        </p>
        {SECTIONS.map((sec) => (
          <section key={sec.kind} className="mb-8">
            <h2 className="text-lg font-bold mb-3">{sec.title}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {(["Men", "Women"] as const).map((gender) => {
                const list = records.filter((r) => r.gender === gender && r.kind === sec.kind);
                return (
                  <div key={gender}>
                    <h3 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">{gender}</h3>
                    <ul className="bg-neutral-950 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                      {list.map((r) => {
                        const slug = r.canonical ? eventSlug(r.canonical) : null;
                        const linkable = slug && eventFromSlug(slug);
                        const gs = gender === "Men" ? "men" : "women";
                        return (
                          <li key={r.event} className="flex flex-col gap-0.5 px-3 py-1.5 text-sm">
                            <span className="flex items-center gap-2">
                              {linkable ? (
                                <Link href={`/disciplines/${slug}/${gs}`} className="w-36 shrink-0 text-neutral-300 hover:text-orange-400 truncate">{r.event}</Link>
                              ) : (
                                <span className="w-36 shrink-0 text-neutral-300 truncate">{r.event}</span>
                              )}
                              <span className="font-mono font-bold text-orange-400">{r.perf}</span>
                              <span className="flex-1 truncate text-right">{r.athlete}</span>
                              {r.nat && sec.kind !== "relay" ? <Flag code={r.nat} /> : null}
                            </span>
                            <span className="text-xs text-neutral-500 truncate">{r.date}{where(r) ? ` · ${where(r)}` : ""}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
