"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, eventLabel } from "@/lib/events";
import Flag from "./Flag";
import Avatar from "./Avatar";

type Mode = "ranking" | "marks";
type Gender = "Men" | "Women";

type RankingRow = { athlete_id: string; display_name: string; points: number; n_results: number; nationality: string | null; photo: string | null };
type MarkRow = { athlete_id: string; display_name: string; mark_display: string; event_name: string; date: string; nationality: string | null; photo: string | null };

export default function StatsWidget({ year }: { year: number }) {
  const [mode, setMode] = useState<Mode>("ranking");
  const [gender, setGender] = useState<Gender>("Men");
  const [groupKey, setGroupKey] = useState<string>(EVENT_GROUPS[0].key);
  const group = EVENT_GROUPS.find((g) => g.key === groupKey)!;
  const [event, setEvent] = useState<string>(group.events[gender][0]);

  const [rankingRows, setRankingRows] = useState<RankingRow[]>([]);
  const [markRows, setMarkRows] = useState<MarkRow[]>([]);
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
    const url = `/api/${mode === "ranking" ? "ranking" : "marks"}?event=${encodeURIComponent(event)}&gender=${gender}&year=${year}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (mode === "ranking") setRankingRows(data);
        else setMarkRows(data);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, event, gender, year]);

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-neutral-900 flex items-center justify-between gap-2">
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          {(["ranking", "marks"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded ${mode === m ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {m === "ranking" ? `${year} Ranking` : `${year} Best Marks`}
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

      <div className="px-4 py-2 border-b border-neutral-800 flex flex-wrap gap-1">
        {EVENT_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroupKey(g.key)}
            className={`text-[10px] px-2 py-1 rounded-full border ${
              groupKey === g.key
                ? "bg-neutral-100 text-black border-neutral-100"
                : "border-neutral-700 text-neutral-400"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {(group.events[gender] as readonly string[]).length > 1 && (
        <div className="px-4 py-2 border-b border-neutral-800">
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700 w-full"
          >
            {(group.events[gender] as readonly string[]).map((ev) => (
              <option key={ev} value={ev}>
                {eventLabel(ev)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="divide-y divide-neutral-800">
        {loading && <div className="px-4 py-4 text-xs text-neutral-500">Loading…</div>}

        {!loading &&
          mode === "ranking" &&
          rankingRows.map((r, i) => (
            <Link
              key={r.athlete_id}
              href={`/athletes/${r.athlete_id}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-neutral-800"
            >
              <span className="text-sm truncate flex items-center gap-2">
                <span className="text-neutral-500 font-mono text-xs w-3">{i + 1}</span>
                <Avatar src={r.photo} name={r.display_name} />
                <Flag code={r.nationality} />
                {r.display_name}
              </span>
              <span className="font-mono text-sm text-orange-400 shrink-0">{r.points}</span>
            </Link>
          ))}

        {!loading &&
          mode === "marks" &&
          markRows.map((m, i) => (
            <Link
              key={i}
              href={`/athletes/${m.athlete_id}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-neutral-800"
            >
              <span className="text-sm truncate flex items-center gap-2">
                <span className="text-neutral-500 font-mono text-xs w-3">{i + 1}</span>
                <Avatar src={m.photo} name={m.display_name} />
                <Flag code={m.nationality} />
                {m.display_name}
              </span>
              <span className="font-mono text-sm text-orange-400 shrink-0">{m.mark_display}</span>
            </Link>
          ))}

        {!loading && mode === "ranking" && rankingRows.length === 0 && (
          <div className="px-4 py-4 text-xs text-neutral-500">No results yet for {eventLabel(event)}.</div>
        )}
        {!loading && mode === "marks" && markRows.length === 0 && (
          <div className="px-4 py-4 text-xs text-neutral-500">No results yet for {eventLabel(event)}.</div>
        )}
      </div>
    </div>
  );
}
