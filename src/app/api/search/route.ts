import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/bigquery";
import { EVENT_GROUPS, eventLabel } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

export type SearchResult = {
  type: "athlete" | "event" | "discipline";
  label: string;
  sublabel?: string;
  href: string;
};

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const qLower = q.toLowerCase();
  const results: SearchResult[] = [];

  // Events (exact catalog, matched client-side against our known list)
  const seenEvents = new Set<string>();
  for (const group of EVENT_GROUPS) {
    if (group.label.toLowerCase().includes(qLower)) {
      results.push({ type: "discipline", label: group.label, href: `/disciplines/${group.key}` });
    }
    for (const events of [group.events.Men, group.events.Women]) {
      for (const ev of events) {
        if (seenEvents.has(ev)) continue;
        if (eventLabel(ev).toLowerCase().includes(qLower) || ev.toLowerCase().includes(qLower)) {
          seenEvents.add(ev);
          results.push({ type: "event", label: eventLabel(ev), href: `/events/${eventSlug(ev)}` });
        }
      }
    }
  }

  // Athletes (BigQuery, name search)
  const athletes = await runQuery<{ athlete_id: string; display_name: string; nationality: string | null }>(`
    SELECT athlete_id, ANY_VALUE(athlete_display_name) AS display_name,
      ARRAY_AGG(nationality IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS nationality
    FROM \`athletics-database.athletics_all.events_enriched\`
    WHERE athlete_id IS NOT NULL AND LOWER(athlete_display_name) LIKE @pattern
    GROUP BY athlete_id
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `, { pattern: `%${qLower}%` });

  for (const a of athletes) {
    results.push({
      type: "athlete",
      label: a.display_name,
      sublabel: a.nationality ?? undefined,
      href: `/athletes/${a.athlete_id}`,
    });
  }

  return NextResponse.json(results.slice(0, 20));
}
