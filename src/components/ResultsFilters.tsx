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
  const years = currentEvent?.years ?? [];

  function go(nextEvent: string, nextYear: YearValue) {
    router.push(`${baseHref}?event=${encodeURIComponent(nextEvent)}&year=${nextYear}`);
  }

  function onEventChange(nextEvent: string) {
    if (year === "all") {
      go(nextEvent, "all");
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
    "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";

  return (
    <div className="flex items-center gap-2">
      <select value={event} onChange={(e) => onEventChange(e.target.value)} className={selectClass}>
        {events.map((ev) => (
          <option key={ev.value} value={ev.value}>
            {ev.label}
          </option>
        ))}
      </select>
      <select value={year} onChange={(e) => onYearChange(e.target.value)} className={selectClass}>
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
