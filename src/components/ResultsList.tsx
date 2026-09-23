"use client";

import { useMemo, useState } from "react";
import { isFieldEvent } from "@/lib/events";
import type { AthleteYearResultRow } from "@/lib/queries";

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type SortBy = "points" | "mark";

export default function ResultsList({
  results,
  event,
  emptyLabel,
}: {
  results: AthleteYearResultRow[];
  event: string;
  emptyLabel: string;
}) {
  const [sortBy, setSortBy] = useState<SortBy>("points");
  const isField = isFieldEvent(event);

  const sorted = useMemo(() => {
    if (sortBy === "points") {
      return [...results].sort((a, b) => (b.competition_score ?? -Infinity) - (a.competition_score ?? -Infinity));
    }
    // Track: lower is better. Field: higher is better.
    return [...results].sort((a, b) => {
      if (a.mark_value === null) return 1;
      if (b.mark_value === null) return -1;
      return isField ? b.mark_value - a.mark_value : a.mark_value - b.mark_value;
    });
  }, [results, sortBy, isField]);

  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-2">
        <span className="text-xs text-neutral-500 mr-1">Sort by</span>
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          {(["points", "mark"] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-1 rounded ${sortBy === s ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {s === "points" ? "Points" : "Mark"}
            </button>
          ))}
        </div>
      </div>
      <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
        {sorted.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2 bg-neutral-900/40">
            <div className="min-w-0">
              <span className="text-sm font-medium truncate">{r.event_name}</span>
              {r.round && <span className="text-xs text-neutral-500 ml-1.5">({r.round})</span>}
              <div className="text-xs text-neutral-500">{formatDate(r.date)}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {r.place && <span className="text-xs text-neutral-500">P{r.place}</span>}
              {r.record === "WR" && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
              )}
              <span className="font-mono text-sm text-neutral-300">{r.mark_display}</span>
              <span className="font-mono text-sm text-orange-400 w-10 text-right">
                {r.competition_score !== null ? r.competition_score : ""}
              </span>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">{emptyLabel}</div>}
      </div>
    </div>
  );
}
