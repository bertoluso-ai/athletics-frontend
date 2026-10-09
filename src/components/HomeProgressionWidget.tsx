"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionBar from "./SectionBar";
import { EVENT_GROUPS, eventLabel, isFieldEvent, sortEventsAlpha } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import type { YearProgressionPoint } from "@/lib/queries";
import YearlyProgressionChart from "./YearlyProgressionChart";

const GROUPS = EVENT_GROUPS.filter((g) => g.key !== "relays"); // no single progression line for a team event

type Gender = "Men" | "Women";

// Compact "Best mark by year" chart for the home page, with its own
// discipline picker -- replaces the old Best Marks of Year list, which ran
// far taller than the rest of the center column. Links out to the full
// Disciplines browser.
export default function HomeProgressionWidget({ initial }: { initial: YearProgressionPoint[] }) {
  const [gender, setGender] = useState<Gender>("Men");
  const [groupKey, setGroupKey] = useState<string>(GROUPS[0].key);
  const group = GROUPS.find((g) => g.key === groupKey)!;
  const [event, setEvent] = useState<string>(group.events[gender][0]);
  const [data, setData] = useState<YearProgressionPoint[]>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const options = group.events[gender] as readonly string[];
    if (!options.includes(event)) setEvent(options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, gender]);

  useEffect(() => {
    if (event === "100 Metres" && gender === "Men") {
      setData(initial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/progression?event=${encodeURIComponent(event)}&gender=${gender}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [event, gender, initial]);

  return (
    <section>
      <SectionBar title="Best mark by year" icon="chart" href="/disciplines" linkLabel="All disciplines →" />
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs shrink-0">
          {(["Men", "Women"] as Gender[]).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`px-2 py-1 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {g === "Men" ? "M" : "W"}
            </button>
          ))}
        </div>
        <select
          value={groupKey}
          onChange={(e) => setGroupKey(e.target.value)}
          className="flex-1 min-w-[7rem] bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700"
        >
          {GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          className="flex-1 min-w-[7rem] bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700"
        >
          {sortEventsAlpha(group.events[gender] as readonly string[]).map((ev) => (
            <option key={ev} value={ev}>
              {eventLabel(ev)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-xs text-neutral-500 border border-neutral-800 rounded-lg">
          Loading…
        </div>
      ) : data.length >= 2 ? (
        <YearlyProgressionChart data={data} isField={isFieldEvent(event)} recordPosition="inline" />
      ) : (
        <div className="h-40 flex items-center justify-center text-xs text-neutral-500 border border-neutral-800 rounded-lg">
          Not enough yearly data for {eventLabel(event)}.
        </div>
      )}
      <Link
        href={`/disciplines/${eventSlug(event)}?gender=${gender}`}
        className="block text-center text-xs text-neutral-500 hover:text-orange-400 mt-2"
      >
        View all → {eventLabel(event)}
      </Link>
    </section>
  );
}
