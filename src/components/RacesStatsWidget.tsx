"use client";

import { RACE_TYPES } from "@/lib/raceTypes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, eventLabel, sortEventsAlpha } from "@/lib/events";
import Flag from "./Flag";

// Same shape as StatsWidget/NationsStatsWidget: gender + discipline group
// filters, a mode toggle -- here "Quality" (field strength) vs "Recent"
// (most recently held), both of which, unlike athlete points, stay
// meaningful combined across every discipline (race_level is tier-anchored,
// comparable whatever the event), so "All" never needs special-casing.
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

type Mode = "quality" | "recent";
type Gender = "Men" | "Women";

type RaceRow = {
  event_name: string;
  athletics_event: string;
  gender: string;
  date: string | null;
  year: number | null;
  round: string | null;
  race_level: number;
  top_athlete_id: string | null;
  top_athlete: string | null;
  top_nationality: string | null;
  top_mark: string | null;
};

// Some historical sources have no exact date on file, only the year --
// see RACE_KEY_SQL in queries.ts.
function formatDate(iso: string | null, year: number | null) {
  if (!iso) return year ? String(year) : "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function RacesStatsWidget({ year }: { year: number }) {
  const [mode, setMode] = useState<Mode>("quality");
  const [gender, setGender] = useState<Gender>("Men");
  const [type, setType] = useState<string>("track");
  const [groupKey, setGroupKey] = useState<string>(EVENT_GROUPS[0].key);
  const group = GROUPS.find((g) => g.key === groupKey)!;
  const isAll = groupKey === "all";
  const [event, setEvent] = useState<string>(group.events[gender][0]);

  const [rows, setRows] = useState<RaceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Keep the selected event valid when group/gender change.
  useEffect(() => {
    const options = group.events[gender] as readonly string[];
    if (!options.includes(event)) setEvent(options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, gender]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const eventParam = isAll ? "all" : event;
    const url = `/api/races?event=${encodeURIComponent(eventParam)}&gender=${gender}&year=${year}&sortBy=${mode}${type ? `&type=${type}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => !cancelled && setRows(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, event, gender, year, isAll, type]);

  // Carries the widget's current filters over to the full /meets page (races view) --
  // landing there on whatever was actually being looked at here, not a
  // reset back to defaults.
  const viewAllHref = `/meets?${new URLSearchParams({
    view: "races",
    year: String(year),
    month: "", // the whole year, not just the current month
    gender,
    ...(isAll ? {} : { discipline: event }),
    sort: mode === "recent" ? "date" : "quality",
    ...(type ? { type } : {}),
  }).toString()}`;

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-3 sm:px-4 py-2 bg-neutral-900 flex items-center justify-between gap-2">
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          {(["quality", "recent"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded ${mode === m ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {m === "quality" ? `${year} Quality` : `${year} Recent`}
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

      {/* Race type (Track / Indoor / Road / Cross country / Race walk / Mountain & trail), no
          "all types": Track is the default, same as the old outdoor-only behaviour -- indoor is
          its own context, so a championship held indoors never outranks the outdoor season unless
          Indoor is picked. The kinds that are not track jump to "All disciplines": the discipline
          pills are track-first. */}
      <div className="px-3 sm:px-4 pt-2 flex items-center justify-between gap-2">
        <Link href={viewAllHref} className="text-xs text-neutral-500 hover:text-orange-400">
          View all →
        </Link>
        <select
          value={type}
          onChange={(e) => {
            const v = e.target.value;
            setType(v);
            if (v && v !== "track" && v !== "indoor") setGroupKey("all");
          }}
          aria-label="Type"
          className="shrink-0 h-[26px] text-xs rounded px-1.5 border bg-neutral-800 border-neutral-700 focus:outline-none focus:border-orange-500"
        >
          {RACE_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Phones/tablets: swipeable pills. Desktop (lg+): a hidden-scrollbar
          pill row can't be scrolled, so the group becomes a dropdown on the
          same line as the discipline one. */}
      <div className="pill-row px-3 sm:px-4 py-2 border-b border-neutral-800 flex flex-nowrap overflow-x-auto gap-1 lg:hidden">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroupKey(g.key)}
            className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
              groupKey === g.key
                ? "bg-orange-50 text-orange-700 border-orange-300"
                : "border-neutral-700 text-neutral-400"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div
        className={`px-3 sm:px-4 py-2 border-b border-neutral-800 gap-2 ${
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
            {sortEventsAlpha(group.events[gender] as readonly string[]).map((ev) => (
              <option key={ev} value={ev}>
                {eventLabel(ev)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="divide-y divide-neutral-800">
        {loading && <div className="px-3 sm:px-4 py-4 text-xs text-neutral-500">Loading…</div>}

        {!loading &&
          rows.map((r, i) => (
            <Link
              key={i}
              href={`/meets/${encodeURIComponent(r.event_name)}?year=${year}&discipline=${encodeURIComponent(r.athletics_event)}&gender=${gender}`}
              className="flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-neutral-800 gap-2"
            >
              <span className="text-sm flex items-center gap-2 min-w-0">
                <span className="text-neutral-500 font-mono text-xs w-3 shrink-0">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate">{r.event_name}</span>
                  <span className="block text-[11px] text-neutral-500 truncate">
                    {formatDate(r.date, r.year)} · {eventLabel(r.athletics_event)}
                    {r.top_athlete && (
                      <>
                        {" · "}
                        <Flag code={r.top_nationality} className="inline-block" />
                        {" "}
                        {r.top_athlete}
                      </>
                    )}
                  </span>
                </span>
              </span>
              <span className="font-mono text-sm text-orange-400 shrink-0">{Math.round(r.race_level)}</span>
            </Link>
          ))}

        {!loading && rows.length === 0 && (
          <div className="px-3 sm:px-4 py-4 text-xs text-neutral-500">No races yet{isAll ? "" : ` for ${eventLabel(event)}`}.</div>
        )}
      </div>
    </div>
  );
}
