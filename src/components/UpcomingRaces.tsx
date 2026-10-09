"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, TIER_PRIORITY, eventLabel, sortEventsAlpha } from "@/lib/events";
import type { UpcomingCompetition } from "@/lib/queries";
import Flag from "./Flag";

// Every tier selectable, not just OW-B: "All categories" prioritizes the
// bigger meets (see getUpcomingCompetitions) so C-F rarely surface there on
// their own -- picking one of them here is the actual way to see them.
const CATEGORIES = Object.keys(TIER_PRIORITY).sort((a, b) => TIER_PRIORITY[a] - TIER_PRIORITY[b]);

// Same discipline list as Latest results (the calendar itself only knows coarse
// families; getUpcomingHome matches the fine discipline through each
// competition's last edition).
const ALL_EVENTS = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women])));

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function UpcomingRaces({ initial }: { initial: UpcomingCompetition[] }) {
  const [category, setCategory] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [rows, setRows] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!category && !discipline) {
      setRows(initial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (discipline) params.set("discipline", discipline);
    fetch(`/api/upcoming?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setRows(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category, discipline, initial]);

  return (
    <section>
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2 mb-3 bg-tint text-neutral-100 px-3 sm:px-4 py-2 rounded-lg">
          <h2 className="text-[13px] font-extrabold uppercase tracking-wide">Upcoming races</h2>
          <Link href="/meets" className="text-[11px] font-semibold text-neutral-400 hover:text-orange-600 shrink-0">
            View all →
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="flex-1 min-w-[7rem] bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All disciplines</option>
            {sortEventsAlpha(ALL_EVENTS).map((ev) => (
              <option key={ev} value={ev}>
                {eventLabel(ev)}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 min-w-[6rem] bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
        {loading && <div className="px-3 sm:px-4 py-6 text-sm text-neutral-500">Loading…</div>}
        {!loading &&
          rows.map((c, i) => {
            // link to the most recent PAST edition's results, when one is
            // known by name -- the upcoming edition itself has no results yet
            const body = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                    <Flag code={c.country} />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400 shrink-0">
                    {c.category}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 truncate">
                  {formatDate(c.date_start)}
                  {c.date_end !== c.date_start ? `–${formatDate(c.date_end)}` : ""} · {c.venue}
                </div>
              </>
            );
            return c.past_event_name ? (
              <Link
                key={i}
                href={`/meets/${encodeURIComponent(c.past_event_name)}`}
                title="Results of the last edition"
                className={`px-3 sm:px-4 py-3 bg-neutral-900/40 hover:bg-neutral-800 ${i >= 4 ? "hidden lg:block" : ""}`}
              >
                {body}
              </Link>
            ) : (
              <div key={i} className={`px-3 sm:px-4 py-3 bg-neutral-900/40 ${i >= 4 ? "hidden lg:block" : ""}`}>
                {body}
              </div>
            );
          })}
        {!loading && rows.length === 0 && (
          <div className="px-3 sm:px-4 py-6 text-sm text-neutral-500">No upcoming races.</div>
        )}
      </div>
    </section>
  );
}
