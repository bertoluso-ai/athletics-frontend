import Link from "next/link";
import Flag from "./Flag";
import PageBar from "./PageBar";
import { eventLabel } from "@/lib/events";
import type { AthleteHomonym } from "@/lib/queries";

// Pagina para elegir entre atletas que comparten nombre (/athletes/<nombre> cuando hay mas de uno).
export default function AthleteChooser({ name, candidates }: { name: string; candidates: AthleteHomonym[] }) {
  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <main className="mx-auto max-w-3xl px-2 sm:px-6 py-6">
        <PageBar title="Athletes" icon="rankings" />
        <h1 className="text-2xl font-bold mb-1">{name}</h1>
        <p className="text-sm text-neutral-400 mb-4">There are {candidates.length} athletes with this name. Pick the one you are looking for.</p>
        <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden bg-neutral-950">
          {candidates.map((c) => (
            <Link key={c.athlete_id} href={`/athletes/${c.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-800">
              <span className="flex items-center gap-3 min-w-0">
                <Flag code={c.nationality} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {c.display_name}
                    <span className="text-neutral-500 font-normal ml-2 text-xs">{c.nationality ?? ""}</span>
                  </span>
                  <span className="block text-xs text-neutral-400">
                    {c.birth_year ? `Born ${c.birth_year}` : "Birth year unknown"} · Active {c.y1 === c.y2 ? c.y1 : `${c.y1}–${c.y2}`}
                    {c.main_event ? ` · ${eventLabel(c.main_event)}` : ""}
                  </span>
                </span>
              </span>
              <span className="text-xs text-neutral-500 shrink-0">{c.n} results</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
