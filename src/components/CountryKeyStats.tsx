"use client";

import { useState } from "react";

export type KeyStat = { n: string | number; label: string; title?: string };

// Key Stats of a country (title bar included) with two views: SEASON (the year selected on
// the page, the default) and ALL TIME (career figures). Both are computed on the server; this only
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
  const [view, setView] = useState<"all" | "season">("season");
  const rows = view === "all" ? allTime : season;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 bg-tint text-neutral-100 px-3 sm:px-4 py-1.5 rounded-lg mb-3">
        <h2 className="text-[13px] font-extrabold uppercase tracking-wide">Key Stats</h2>
        <div className="flex rounded bg-white/60 p-0.5 text-xs">
          {(
            [
              ["season", "Season"],
              ["all", "All time"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              title={v === "season" ? `${year} season` : "Career figures"}
              className={`px-2.5 py-0.5 rounded ${view === v ? "bg-neutral-950 text-neutral-100 font-semibold shadow-sm" : "text-neutral-400 hover:text-neutral-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
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
