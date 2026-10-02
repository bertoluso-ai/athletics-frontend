import { NextRequest, NextResponse } from "next/server";
import { pgQuery } from "@/lib/pg";
import { normalizeSeriesPg, displaySeriesPg, getAthleteSlugs, athleteHref } from "@/lib/queries";
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
      const firstEvent = group.events.Men[0] ?? group.events.Women[0];
      results.push({ type: "discipline", label: group.label, href: `/disciplines/${eventSlug(firstEvent)}` });
    }
    for (const events of [group.events.Men, group.events.Women]) {
      for (const ev of events) {
        if (seenEvents.has(ev)) continue;
        if (eventLabel(ev).toLowerCase().includes(qLower) || ev.toLowerCase().includes(qLower)) {
          seenEvents.add(ev);
          results.push({ type: "event", label: eventLabel(ev), href: `/disciplines/${eventSlug(ev)}` });
        }
      }
    }
  }

  // Athletes (Postgres, name search)
  const athletes = await pgQuery<{ athlete_id: string; display_name: string; nationality: string | null }>(`
    SELECT athlete_id, (ARRAY_AGG(athlete_display_name))[1] AS display_name,
      (ARRAY_AGG(nationality ORDER BY date DESC) FILTER (WHERE nationality IS NOT NULL))[1] AS nationality
    FROM events
    -- accent-insensitive on both sides ("hanzekovic" finds "Hanžeković").
    -- immutable_unaccent (not the plain unaccent() builtin, which can't be
    -- marked IMMUTABLE) so this matches events_athlete_name_trgm_idx --
    -- without it this was a full sequential scan on every keystroke
    -- (confirmed live: ~4s just for this half of the search, a leading
    -- wildcard LIKE can never use a plain B-tree index).
    WHERE athlete_id IS NOT NULL
      AND LOWER(immutable_unaccent(athlete_display_name)) LIKE $1
    GROUP BY athlete_id
    -- best athletes first: career points, then number of results
    ORDER BY COALESCE(SUM(competition_score), 0) DESC, COUNT(*) DESC
    LIMIT 8
  `, [`%${qLower.normalize("NFD").replace(/\p{M}/gu, "")}%`]);

  const athleteSlugs = await getAthleteSlugs(athletes.map((a) => a.athlete_id));
  for (const a of athletes) {
    results.push({
      type: "athlete",
      label: a.display_name,
      sublabel: a.nationality ?? undefined,
      href: athleteHref(a.athlete_id, athleteSlugs),
    });
  }

  // Meets/competitions (Postgres, name search; events_event_name_trgm_idx
  // covers the leading-wildcard LIKE below). Group by the same
  // normalized display_series_name used by the meet page itself (handles
  // ordinal prefixes AND the IAAF -> World Athletics rebrand AND
  // host-city suffixes) so the series shows up as ONE result instead of
  // one per edition; linking with the most recent edition's exact name
  // still lands on a page listing every edition.
  const meets = await pgQuery<{ event_name: string; year: number; n_results: number; label: string }>(`
    WITH normalized AS (
      SELECT event_name, year, COALESCE(display_series_name, event_name) AS series_label,
        ${normalizeSeriesPg("COALESCE(display_series_name, event_name)")} AS series_key
      FROM events
      WHERE event_name IS NOT NULL AND LOWER(event_name) LIKE $1
    ),
    best_label AS (
      -- The shortest series_label in the group is the best proxy for the
      -- generic/canonical form -- a specific edition's own name tends to
      -- carry extra clutter (an ordinal, a host city) a bare series name
      -- doesn't, e.g. "Olympic Games" (17 chars) vs "The XXXIII Olympic
      -- Games" (23 chars) both belong to the same normalized series.
      SELECT series_key,
        ${displaySeriesPg("(ARRAY_AGG(series_label ORDER BY LENGTH(series_label) ASC, series_label ASC))[1]")} AS label
      FROM normalized
      GROUP BY series_key
    ),
    joined AS (
      SELECT n.event_name, n.year, COUNT(*) OVER (PARTITION BY n.series_key) AS n_results, b.label,
        ROW_NUMBER() OVER (PARTITION BY n.series_key ORDER BY n.year DESC) AS rn
      FROM normalized n
      JOIN best_label b USING (series_key)
    )
    SELECT event_name, year, n_results, label
    FROM joined
    WHERE rn = 1
    ORDER BY n_results DESC
    LIMIT 8
  `, [`%${qLower}%`]);

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
