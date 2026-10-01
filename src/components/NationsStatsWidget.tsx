"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, eventLabel } from "@/lib/events";
import Flag from "./Flag";

// Identical pattern to StatsWidget, one dimension over: nations instead of
// athletes (points/wins ranking, same gender + discipline pickers).
const GROUPS = [
  {
    key: "all",
    label: "All",
    events: {
      Men: Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men]))),
      Women: Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Women]))),
    },
  },
  ...EVENT_GROUPS,
];

type Mode = "points" | "wins";
type Gender = "Men" | "Women";

type NationRow = { code: string; name: string; points: number; wins: number };

export default function NationsStatsWidget({ year }: { year: number }) {
  const [mode, setMode] = useState<Mode>("points");
  const [gender, setGender] = useState<Gender>("Men");
  const [groupKey, setGroupKey] = useState<string>(EVENT_GROUPS[0].key);
  const group = GROUPS.find((g) => g.key === groupKey)!;
  const isAll = groupKey === "all";
  const [event, setEvent] = useState<string>(group.events[gender][0]);

  const [rows, setRows] = useState<NationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const options = group.events[gender] as readonly string[];
    if (!options.includes(event)) setEvent(options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, gender]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const view = mode === "wins" ? "wins" : "season";
    // "All": the backend (getNationRanking) already sums across every
    // discipline when no event is given -- same as the full Rankings page's
    // "All disciplines" option -- so omitting the param, not pinning it to
    // whatever the (hidden) discipline dropdown last held, is what actually
    // combines every event.
    const url = `/api/nation-ranking?${isAll ? "" : `event=${encodeURIComponent(event)}&`}gender=${gender}&year=${year}&view=${view}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => !cancelled && setRows(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, event, gender, year, isAll]);

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-neutral-900 flex items-center justify-between gap-2">
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          {(["points", "wins"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded ${mode === m ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {m === "points" ? `${year} Points` : `${year} Wins`}
            </button>
          ))}
        </div>
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
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
      </div>

      <div className="pill-row px-4 py-2 border-b border-neutral-800 flex flex-nowrap overflow-x-auto gap-1 lg:hidden">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroupKey(g.key)}
            className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
              groupKey === g.key
                ? "bg-neutral-100 text-black border-neutral-100"
                : "border-neutral-700 text-neutral-400"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div
        className={`px-4 py-2 border-b border-neutral-800 gap-2 ${
          !isAll && (group.events[gender] as readonly string[]).length > 1 ? "flex" : "hidden lg:flex"
        }`}
      >
        <select
          value={groupKey}
          onChange={(e) => setGroupKey(e.target.value)}
          className="hidden lg:block flex-1 min-w-0 bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700"
        >
          {GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        {!isAll && (group.events[gender] as readonly string[]).length > 1 && (
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="flex-1 min-w-0 bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700"
          >
            {(group.events[gender] as readonly string[]).map((ev) => (
              <option key={ev} value={ev}>
                {eventLabel(ev)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="divide-y divide-neutral-800">
        {loading && <div className="px-4 py-4 text-xs text-neutral-500">Loading…</div>}

        {!loading &&
          rows.map((r, i) => (
            <Link
              key={r.code}
              href={`/countries/${r.code}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-neutral-800"
            >
              <span className="text-sm flex items-center gap-2 min-w-0">
                <span className="text-neutral-500 font-mono text-xs w-3 shrink-0">{i + 1}</span>
                <Flag code={r.code} />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="font-mono text-sm text-orange-400 shrink-0">
                {mode === "wins" ? r.wins : r.points}
              </span>
            </Link>
          ))}

        {!loading && rows.length === 0 && (
          <div className="px-4 py-4 text-xs text-neutral-500">No results yet{isAll ? "" : ` for ${eventLabel(event)}`}.</div>
        )}
      </div>
    </div>
  );
}
