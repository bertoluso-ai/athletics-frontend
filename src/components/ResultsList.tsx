"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { eventLabel, isFieldEvent, TIER_LABELS } from "@/lib/events";
import type { AthleteYearResultRow } from "@/lib/queries";
import WindBadge from "./WindBadge";
import ResultsFilters, { type EventOption, type YearValue } from "./ResultsFilters";

// Compact by default (day + month) -- the year is only ambiguous once
// "All years" is selected, so it's added back in that case only.
function formatDate(iso: string | null, year: number, showYear: boolean) {
  if (!iso) return String(year);
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(year);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(showYear ? { year: "numeric" } : {}) });
}

type SortBy = "date" | "pos" | "mark" | "points";

// Sensible default direction the first time a column is selected -- most
// recent date, best position, best mark (track vs field differ), most points.
function defaultDirFor(col: SortBy, isField: boolean): 1 | -1 {
  if (col === "pos") return 1;
  if (col === "mark") return isField ? -1 : 1;
  return -1; // date, points: most/latest first
}

// Numeric value to sort by, per column -- null means "missing", always
// pinned last.
function sortValue(r: AthleteYearResultRow, col: SortBy): number | null {
  // Rows with no exact date (only a year) sort by that year instead of
  // always falling last -- Jan 1st puts them at the start of their year
  // among rows that do have an exact date.
  if (col === "date") return r.date ? Date.parse(r.date) : Date.parse(`${r.year}-01-01`);
  if (col === "pos") return r.place;
  if (col === "points") return r.competition_score;
  return r.mark_value;
}

// Date/Pos narrow, Race takes whatever's left, metric column hugs its content
// -- no vertical rules between them, just alignment (a horizontal rule
// between rows is what actually separates entries, not a boxed grid).
// The date column widens when "All years" is selected -- the year gets
// appended to the date text then ("02 Mar 2002" vs "02 Mar"), and the
// narrower width overflowed into the Pos column.
function gridCols(showYear: boolean) {
  return showYear ? "grid-cols-[5.4rem_2rem_1fr_auto]" : "grid-cols-[3.4rem_2rem_1fr_auto]";
}

export default function ResultsList({
  results,
  event,
  gender,
  emptyLabel,
  filterEvents,
  year,
  baseHref,
}: {
  results: AthleteYearResultRow[];
  event: string;
  gender: string;
  emptyLabel: string;
  filterEvents: EventOption[];
  year: YearValue;
  baseHref: string;
}) {
  const [sortBy, setSortBy] = useState<SortBy>("points");
  const [sortDir, setSortDir] = useState<1 | -1 | null>(null);
  const isField = isFieldEvent(event);
  // Raw marks mix seconds and metres once disciplines are mixed together --
  // sorting by that raw value only makes sense within a single discipline.
  const isAll = event === "all";
  const effectiveSortBy = isAll && sortBy === "mark" ? "points" : sortBy;
  const activeDir = sortDir ?? defaultDirFor(effectiveSortBy, isField);
  const metric: "mark" | "points" = effectiveSortBy === "mark" ? "mark" : "points";

  function handleSort(col: SortBy) {
    if (effectiveSortBy === col) {
      setSortDir((activeDir * -1) as 1 | -1);
    } else {
      setSortBy(col);
      setSortDir(null);
    }
  }

  function arrow(col: SortBy) {
    if (effectiveSortBy !== col) return null;
    return <span>{activeDir === 1 ? "▲" : "▼"}</span>;
  }

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      const av = sortValue(a, effectiveSortBy);
      const bv = sortValue(b, effectiveSortBy);
      if (av === null || bv === null) {
        if (av === null && bv === null) return 0;
        return av === null ? 1 : -1;
      }
      return activeDir * (av - bv);
    });
  }, [results, effectiveSortBy, activeDir]);

  return (
    <div>
      {filterEvents.length > 0 && (
        <div className="mb-2">
          <ResultsFilters events={filterEvents} event={event} year={year} baseHref={baseHref} />
        </div>
      )}
      <div className={`grid ${gridCols(year === "all")} gap-x-3 px-1 pb-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800`}>
        <button onClick={() => handleSort("date")} className="text-left flex items-center gap-0.5 hover:text-neutral-300">
          Date {arrow("date")}
        </button>
        <button onClick={() => handleSort("pos")} className="text-left flex items-center gap-0.5 hover:text-neutral-300">
          Pos {arrow("pos")}
        </button>
        <span>Race</span>
        <button
          onClick={() => handleSort(metric === "mark" ? "points" : isAll ? "points" : "mark")}
          className="text-right flex items-center justify-end gap-0.5 hover:text-neutral-300"
          title="Click to switch between Mark and Points, or click again to flip the sort direction"
        >
          {metric === "mark" ? "Mark" : "Points"} {arrow(metric)}
        </button>
      </div>
      <div className="divide-y divide-neutral-800">
        {sorted.map((r, i) => (
          <div key={i} className={`grid ${gridCols(year === "all")} gap-x-3 items-start px-1 py-2.5`}>
            <span className="text-xs text-neutral-500 whitespace-nowrap pt-0.5">
              {formatDate(r.date, r.year, year === "all")}
            </span>
            <span className="text-xs text-neutral-500 pt-0.5">{r.place ?? "–"}</span>
            <span className="min-w-0 text-sm">
              <div>
                <Link
                  href={`/meets/${encodeURIComponent(r.event_name)}?year=${r.year}&discipline=${encodeURIComponent(r.athletics_event)}&gender=${gender}`}
                  className="font-medium hover:text-orange-400"
                >
                  {r.event_name}
                </Link>
                {r.round && <span className="text-xs text-neutral-500"> ({r.round})</span>}
                {r.record === "WR" && (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                {eventLabel(r.athletics_event)}
                {r.competition_level && (
                  <span
                    title={TIER_LABELS.find((t) => t.value === r.competition_level)?.label ?? r.competition_level}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400"
                  >
                    {r.competition_level}
                  </span>
                )}
              </div>
            </span>
            <span className="text-right whitespace-nowrap">
              {effectiveSortBy === "mark" ? (
                <span className="flex items-center justify-end gap-1.5">
                  <WindBadge wind={r.wind} windLegal={r.wind_legal} />
                  <span className="font-mono text-sm text-neutral-200">{r.mark_display}</span>
                </span>
              ) : (
                <span className="font-mono text-sm text-orange-400">
                  {r.competition_score !== null ? r.competition_score : ""}
                </span>
              )}
            </span>
          </div>
        ))}
        {sorted.length === 0 && <div className="px-1 py-4 text-sm text-neutral-500">{emptyLabel}</div>}
      </div>
    </div>
  );
}
