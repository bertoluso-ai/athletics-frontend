import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { EVENT_GROUPS, eventLabel } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

export default async function DisciplinePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const group = EVENT_GROUPS.find((g) => g.key === key);
  if (!group) notFound();

  const allEvents = Array.from(new Set([...group.events.Men, ...group.events.Women]));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <h1 className="text-2xl font-bold mb-6">{group.label}</h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allEvents.map((ev) => (
            <Link
              key={ev}
              href={`/events/${eventSlug(ev)}`}
              className="border border-neutral-800 rounded-lg px-4 py-3 text-sm hover:bg-neutral-900 hover:border-orange-500"
            >
              {eventLabel(ev)}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
