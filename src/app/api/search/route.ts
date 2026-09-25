import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/bigquery";
import { normalizeSeries, displaySeries } from "@/lib/queries";
import { EVENT_GROUPS, eventLabel } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

export type SearchResult = {
  type: "athlete" | "event" | "discipline" | "meet";
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
    -- accent-insensitive on both sides ("hanzekovic" finds "Hanžeković")
    WHERE athlete_id IS NOT NULL
      AND LOWER(REGEXP_REPLACE(NORMALIZE(athlete_display_name, NFD), r'\\p{M}', '')) LIKE @pattern
    GROUP BY athlete_id
    -- best athletes first: career points, then number of results
    ORDER BY IFNULL(SUM(competition_score), 0) DESC, COUNT(*) DESC
    LIMIT 8
  `, { pattern: `%${qLower.normalize("NFD").replace(/\p{M}/gu, "")}%` });

  for (const a of athletes) {
    results.push({
      type: "athlete",
      label: a.display_name,
      sublabel: a.nationality ?? undefined,
      href: `/athletes/${a.athlete_id}`,
    });
  }

  // Meets/competitions (BigQuery, name search). Group by the same
  // normalized display_series_name used by the meet page itself (handles
  // ordinal prefixes AND the IAAF -> World Athletics rebrand AND
  // host-city suffixes) so the series shows up as ONE result instead of
  // one per edition; linking with the most recent edition's exact name
  // still lands on a page listing every edition.
  const meets = await runQuery<{ event_name: string; year: number; n_results: number; label: string }>(`
    WITH normalized AS (
      SELECT event_name, year, COALESCE(display_series_name, event_name) AS series_label,
        ${normalizeSeries("COALESCE(display_series_name, event_name)")} AS series_key
      FROM \`athletics-database.athletics_all.events_enriched\`
      WHERE event_name IS NOT NULL AND LOWER(event_name) LIKE @pattern
    ),
    best_label AS (
      -- The shortest series_label in the group is the best proxy for the
      -- generic/canonical form -- a specific edition's own name tends to
      -- carry extra clutter (an ordinal, a host city) a bare series name
      -- doesn't, e.g. "Olympic Games" (17 chars) vs "The XXXIII Olympic
      -- Games" (23 chars) both belong to the same normalized series.
      SELECT series_key,
        ${displaySeries("ARRAY_AGG(series_label ORDER BY LENGTH(series_label) ASC, series_label ASC LIMIT 1)[OFFSET(0)]")} AS label
      FROM normalized
      GROUP BY series_key
    )
    SELECT n.event_name, n.year, COUNT(*) OVER (PARTITION BY n.series_key) AS n_results, b.label
    FROM normalized n
    JOIN best_label b USING (series_key)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY n.series_key ORDER BY n.year DESC) = 1
    ORDER BY n_results DESC
    LIMIT 8
  `, { pattern: `%${qLower}%` });

  for (const m of meets) {
    results.push({
      type: "meet",
      label: m.label,
      sublabel: String(m.year),
      href: `/meets/${encodeURIComponent(m.event_name)}?year=${m.year}`,
    });
  }

  return NextResponse.json(results.slice(0, 20));
}
