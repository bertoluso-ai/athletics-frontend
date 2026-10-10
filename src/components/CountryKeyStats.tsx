"use client";

import { useState } from "react";

export type KeyStat = { n: string | number; label: string; title?: string };

// Key Stats of a country with two views: ALL TIME (career figures) and SEASON
// (the year selected on the page). Both are computed on the server; this only
// switches which list is shown, so changing view does not reload the page.
export default function CountryKeyStats({
  allTime,
  season,
  year,
}: {
  allTime: KeyStat[];
  season: KeyStat[];
  year: number;
}) {
  const [view, setView] = useState<"all" | "season">("all");
  const rows = view === "all" ? allTime : season;
  return (
    <div>
      <div className="flex rounded bg-neutral-800 p-0.5 text-xs w-fit mb-3">
        {(
          [
            ["all", "All time"],
            ["season", String(year)],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded ${view === v ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {rows.map((k) => (
          <div key={k.label} className="flex items-center gap-2" title={k.title}>
            <span className="w-14 shrink-0 text-center font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500 text-black">
              {k.n}
            </span>
            <span className="text-neutral-300">{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
