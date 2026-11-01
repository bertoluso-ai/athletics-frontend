import type { Metadata } from "next";
import Link from "next/link";
import { EVENT_GROUPS } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

export const metadata: Metadata = {
  title: "Disciplines",
  description: "Every athletics discipline: all-time lists, yearly bests, records and progression for men and women.",
  alternates: { canonical: "/disciplines" },
};

// Hub de disciplinas: una tarjeta por grupo (sprints, vallas, fondo...) con cada prueba y enlaces Men / Women.
export default function DisciplinesIndex() {
  return (
    <div className="min-h-screen bg-canvas text-neutral-100">
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-1">Disciplines</h1>
        <p className="text-sm text-neutral-400 mb-5">All-time lists, yearly bests and progression for every event. Pick an event and a gender.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_GROUPS.map((group) => {
            // pruebas del grupo (union hombres + mujeres, sin repetir) y a que generos aplica cada una
            const mixedList = ("Mixed" in group.events ? (group.events as { Mixed: readonly string[] }).Mixed : []) as readonly string[];
            const events = Array.from(new Set<string>([...group.events.Men, ...group.events.Women, ...mixedList]));
            return (
              <section key={group.key} className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
                <h2 className="bg-tint text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2">{group.label}</h2>
                <ul className="divide-y divide-neutral-800">
                  {events.map((ev) => {
                    const slug = eventSlug(ev);
                    const label = group.names[ev] ?? ev;
                    const men = (group.events.Men as readonly string[]).includes(ev);
                    const women = (group.events.Women as readonly string[]).includes(ev);
                    const mixed = mixedList.includes(ev);
                    return (
                      <li key={ev} className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-sm">
                        <span className="truncate">{label}</span>
                        <span className="flex items-center gap-1.5 shrink-0 text-xs">
                          {men && (
                            <Link href={`/disciplines/${slug}?gender=Men`} aria-label={`${label}, men`} className="px-2 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:border-orange-500 hover:text-orange-400">
                              Men
                            </Link>
                          )}
                          {women && (
                            <Link href={`/disciplines/${slug}?gender=Women`} aria-label={`${label}, women`} className="px-2 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:border-orange-500 hover:text-orange-400">
                              Women
                            </Link>
                          )}
                          {mixed && (
                            <Link href={`/disciplines/${slug}?gender=Mixed`} aria-label={`${label}, mixed`} className="px-2 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:border-orange-500 hover:text-orange-400">
                              Mixed
                            </Link>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
