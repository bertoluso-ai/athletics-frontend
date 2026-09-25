"use client";

import { useRouter } from "next/navigation";

export type EventOption = { value: string; label: string; years: number[] };
export type YearValue = number | "all";

export default function ResultsFilters({
  events,
  event,
  year,
  baseHref,
}: {
  events: EventOption[];
  event: string;
  year: YearValue;
  baseHref: string;
}) {
  const router = useRouter();
  const currentEvent = events.find((ev) => ev.value === event);
  const allYears = Array.from(new Set(events.flatMap((ev) => ev.years))).sort((a, b) => b - a);
  const years = event === "all" ? allYears : currentEvent?.years ?? [];

  function go(nextEvent: string, nextYear: YearValue) {
    router.push(`${baseHref}?event=${encodeURIComponent(nextEvent)}&year=${nextYear}`, { scroll: false });
  }

  function onEventChange(nextEvent: string) {
    if (year === "all" || nextEvent === "all") {
      go(nextEvent, year);
      return;
    }
    const opt = events.find((ev) => ev.value === nextEvent);
    // The previously selected year may have no data for the new discipline --
    // jump to its most recent year with results instead of a dead end.
    const nextYear = opt?.years.includes(year) ? year : opt?.years[0] ?? year;
    go(nextEvent, nextYear);
  }

  function onYearChange(raw: string) {
    go(event, raw === "all" ? "all" : Number(raw));
  }

  const selectClass =
    "bg-neutral-800 text-xs rounded px-1.5 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500 min-w-0 truncate";

  return (
    <div className="flex items-center lg:items-start gap-1.5 min-w-0">
      <select value={event} onChange={(e) => onEventChange(e.target.value)} className={`${selectClass} max-w-[7rem] lg:max-w-[12rem]`}>
        <option value="all">All</option>
        {events.map((ev) => (
          <option key={ev.value} value={ev.value}>
            {ev.label}
          </option>
        ))}
      </select>
      {/* desktop: every year visible as a tab (PCS style); phones keep the select */}
      <div className="hidden lg:flex flex-wrap gap-1 ml-1">
        {[...years.map((y) => ({ v: y as YearValue, label: String(y) })), { v: "all" as YearValue, label: "All" }].map((t) => (
          <button
            key={t.label}
            onClick={() => go(event, t.v)}
            className={`text-xs px-2 py-1 rounded border ${
              year === t.v
                ? "bg-neutral-100 text-black border-neutral-100 font-semibold"
                : "border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <select value={year} onChange={(e) => onYearChange(e.target.value)} className={`${selectClass} max-w-[4.5rem] lg:hidden`}>
        <option value="all">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
