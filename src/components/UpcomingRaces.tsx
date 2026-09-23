"use client";

import { useEffect, useState } from "react";
import { TIER_PRIORITY } from "@/lib/events";
import type { UpcomingCompetition } from "@/lib/queries";
import Flag from "./Flag";

const CATEGORIES = Object.keys(TIER_PRIORITY)
  .filter((c) => ["OW", "DF", "GW", "GL", "A", "B"].includes(c))
  .sort((a, b) => TIER_PRIORITY[a] - TIER_PRIORITY[b]);

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function UpcomingRaces({ initial }: { initial: UpcomingCompetition[] }) {
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!category) {
      setRows(initial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/upcoming?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setRows(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category, initial]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Upcoming Races
        </h2>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
        {loading && <div className="px-4 py-6 text-sm text-neutral-500">Loading…</div>}
        {!loading &&
          rows.map((c, i) => (
            <div key={i} className="px-4 py-3 bg-neutral-900/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                  <Flag code={c.country} />
                  {c.name}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400 shrink-0">
                  {c.category}
                </span>
              </div>
              <div className="text-xs text-neutral-400 truncate">
                {formatDate(c.date_start)}
                {c.date_end !== c.date_start ? `–${formatDate(c.date_end)}` : ""} · {c.venue}
              </div>
            </div>
          ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500">No upcoming races.</div>
        )}
      </div>
    </section>
  );
}
