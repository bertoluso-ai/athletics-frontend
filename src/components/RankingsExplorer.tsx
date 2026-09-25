"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import YearlyProgressionChart from "./YearlyProgressionChart";
import type { YearProgressionPoint } from "@/lib/queries";
import { useSearchParams } from "next/navigation";
import { EVENT_GROUPS, eventLabel, isRelayEvent, isFieldEvent } from "@/lib/events";
import Avatar from "./Avatar";
import Flag from "./Flag";
import WindBadge from "./WindBadge";

type Gender = "Men" | "Women";
type AgeCategory = "" | "U18" | "U20" | "U23";
type SortBy = "mark" | "points";

type RankingRow = {
  athlete_id: string;
  display_name: string;
  points: number;
  n_results: number;
  nationality: string | null;
  birth_year: number | null;
  best_mark?: string | null;
  best_mark_value?: number | null;
  best_mark_wind?: string | null;
  best_mark_wind_legal?: boolean | null;
  photo: string | null;
};

type RelayRankingRow = {
  nationality: string;
  points: number;
  n_results: number;
  best_mark: string | null;
  best_mark_value: number | null;
  roster: string[];
  record: string | null;
};

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

const GLOBAL_KEY = "global";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1895 }, (_, i) => CURRENT_YEAR - i); // data starts with the 1896 Olympics
const AGE_CATEGORIES: { value: AgeCategory; label: string }[] = [
  { value: "", label: "Senior (all ages)" },
  { value: "U23", label: "U23" },
  { value: "U20", label: "U20" },
  { value: "U18", label: "U18" },
];

function findGroupKeyForEvent(ev: string | null, gender: Gender): string {
  if (ev === "all") return GLOBAL_KEY;
  if (ev) {
    const g = EVENT_GROUPS.find((g) => (g.events[gender] as readonly string[]).includes(ev));
    if (g) return g.key;
  }
  return EVENT_GROUPS[0].key;
}

export default function RankingsExplorer() {
  const searchParams = useSearchParams();
  const initialEvent = searchParams.get("event");
  const initialGender: Gender = searchParams.get("gender") === "Women" ? "Women" : "Men";
  const initialYearParam = searchParams.get("year");

  const [gender, setGender] = useState<Gender>(initialGender);
  const [groupKey, setGroupKey] = useState<string>(() => findGroupKeyForEvent(initialEvent, initialGender));
  const isGlobal = groupKey === GLOBAL_KEY;
  const group = isGlobal ? null : EVENT_GROUPS.find((g) => g.key === groupKey)!;
  const [event, setEvent] = useState<string>(() => {
    if (isGlobal) return "all";
    const options = group!.events[gender] as readonly string[];
    return initialEvent && options.includes(initialEvent) ? initialEvent : options[0];
  });
  const [year, setYear] = useState<number | "all">(() =>
    initialYearParam === "all" ? "all" : initialYearParam ? Number(initialYearParam) : CURRENT_YEAR
  );
  const [nationality, setNationality] = useState("");
  const [ageCategory, setAgeCategory] = useState<AgeCategory>("");
  // Sorting by mark (the actual performance) is the more meaningful view
  // and takes priority over points (which rewards frequency of competing).
  const [sortBy, setSortBy] = useState<SortBy>("mark");
  const [page, setPage] = useState(1);
  // Off by default: wind-illegal marks are excluded from "best mark"
  // whenever the athlete has a legal one, matching All-Time Best / Best
  // of year. This opts back in to letting illegal marks compete too.
  const [includeIllegalWind, setIncludeIllegalWind] = useState(false);
  // Outdoor by default -- indoor and outdoor are separate ranking contexts
  // in the sport (separate world records exist), never blended together.
  const [indoor, setIndoor] = useState(false);

  const isRelay = !isGlobal && isRelayEvent(event);
  const [rows, setRows] = useState<(RankingRow | RelayRankingRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  // summary first: the top 20 and a progression chart; "Show all" opens the
  // full paginated list
  const [showAll, setShowAll] = useState(false);
  const [progression, setProgression] = useState<YearProgressionPoint[]>([]);
  const [nationalities, setNationalities] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGlobal) {
      setEvent("all");
      return;
    }
    const options = group!.events[gender] as readonly string[];
    if (!options.includes(event)) setEvent(options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, gender]);

  useEffect(() => {
    // Nationality options depend on event/gender/year -- reset the pick if
    // it's no longer valid instead of silently filtering to zero results.
    setNationality("");
  }, [event, gender, year]);

  // Any change to what's being ranked invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [event, gender, year, nationality, ageCategory, sortBy, includeIllegalWind, indoor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ event, gender, year: String(year), sortBy, page: String(page) });
    if (nationality) params.set("nationality", nationality);
    if (ageCategory) params.set("ageCategory", ageCategory);
    if (includeIllegalWind) params.set("includeIllegalWind", "true");
    if (indoor) params.set("indoor", "true");
    fetch(`/api/rankings?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setTotal(data.total);
        setPageSize(data.pageSize);
        setNationalities(data.nationalities);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [event, gender, year, nationality, ageCategory, sortBy, includeIllegalWind, indoor, page]);

  useEffect(() => {
    setShowAll(false);
  }, [event, gender, year, nationality, ageCategory, groupKey]);

  useEffect(() => {
    if (isGlobal || isRelay || !event) {
      setProgression([]);
      return;
    }
    let cancelled = false;
    const q = new URLSearchParams({ event, gender, ...(ageCategory ? { ageCategory } : {}) });
    fetch(`/api/progression?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setProgression(Array.isArray(d) ? d : []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event, gender, ageCategory, isGlobal, isRelay]);

  const visibleRows = showAll || page > 1 ? rows : rows.slice(0, 20);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectClass =
    "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";

  return (
    <div>
      {/* discipline first: group pills across the full width + event */}
      <div className="pill-row flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible gap-1 mb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          onClick={() => setGroupKey(GLOBAL_KEY)}
          title="Total points across every discipline that year, not one event's ranking"
          className={`shrink-0 sm:flex-1 text-center whitespace-nowrap text-xs px-2.5 py-1.5 rounded-full border ${
            isGlobal ? "bg-orange-500 text-black border-orange-500 font-semibold" : "border-neutral-700 text-neutral-400"
          }`}
        >
          Global
        </button>
        {EVENT_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroupKey(g.key)}
            className={`shrink-0 sm:flex-1 text-center whitespace-nowrap text-xs px-2.5 py-1.5 rounded-full border ${
              groupKey === g.key
                ? "bg-neutral-100 text-black border-neutral-100"
                : "border-neutral-700 text-neutral-400"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {!isGlobal && (
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          className={`${selectClass} w-full mb-4`}
        >
          {(group!.events[gender] as readonly string[]).map((ev) => (
            <option key={ev} value={ev}>{eventLabel(ev)}</option>
          ))}
        </select>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          {(["Men", "Women"] as Gender[]).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`px-3 py-1.5 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
          className={`${selectClass} flex-1 min-w-0`}
        >
          <option value="all">All years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={ageCategory}
          onChange={(e) => setAgeCategory(e.target.value as AgeCategory)}
          className={`${selectClass} flex-1 min-w-0`}
        >
          {AGE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select value={nationality} onChange={(e) => setNationality(e.target.value)} className={`${selectClass} flex-1 min-w-0`}>
          <option value="">All nationalities</option>
          {nationalities.map((n) => (
            <option key={n.code} value={n.code}>{n.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="text-xs text-neutral-500">
          {total > 0 && (isRelay ? `${total} teams` : `${total} athletes`)}
        </span>
        <div className="flex items-center gap-3">
          {!isGlobal && !isRelay && (
            <button
              onClick={() => setIncludeIllegalWind((v) => !v)}
              title="Wind-illegal marks are excluded from each athlete's best mark unless they have no legal one -- turn this on to let them compete too"
              className={`text-[10px] px-2 py-1 rounded-full border ${
                includeIllegalWind
                  ? "bg-red-500/20 border-red-500/40 text-red-400"
                  : "border-neutral-700 text-neutral-400"
              }`}
            >
              {includeIllegalWind ? "Wind: shown" : "Wind: hidden"}
            </button>
          )}
          {!isGlobal && !isRelay && groupKey !== "road" && groupKey !== "cross" && (
            <button
              onClick={() => setIndoor((v) => !v)}
              title="Indoor and outdoor marks are separate ranking contexts in the sport (separate world records exist) -- never blended into one ranking here"
              className={`text-[10px] px-2 py-1 rounded-full border ${
                indoor
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  : "border-neutral-700 text-neutral-400"
              }`}
            >
              {indoor ? "Indoor" : "Outdoor"}
            </button>
          )}
          {!isGlobal && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500 mr-1">Sort by</span>
            <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
              {(["mark", "points"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-1 rounded ${sortBy === s ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                >
                  {s === "mark" ? "Mark" : "Points"}
                </button>
              ))}
            </div>
          </div>
          )}
        </div>
      </div>

      {progression.length >= 2 && (
        <div className="mb-4 border border-neutral-800 rounded-lg p-3 bg-neutral-900/40">
          <div className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">
            {eventLabel(event)} · best mark by year
          </div>
          <YearlyProgressionChart data={progression} isField={isFieldEvent(event)} />
        </div>
      )}

      <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
        {loading && <div className="px-4 py-4 text-xs text-neutral-500">Loading…</div>}
        {!loading && isRelay &&
          (visibleRows as RelayRankingRow[]).map((r, i) => (
            <div
              key={r.nationality}
              className="flex items-center justify-between px-4 py-2"
            >
              <span className="text-sm flex items-center gap-2 min-w-0 flex-1">
                <span className="text-neutral-500 font-mono text-xs w-6 shrink-0">
                  {(page - 1) * pageSize + i + 1}
                </span>
                <Flag code={r.nationality} />
                <span className="truncate">
                  {r.nationality}
                  <span className="text-neutral-500 font-normal ml-2 text-xs">
                    {r.roster.map(lastName).join(" · ")}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                {r.best_mark && (
                  <span className={`font-mono text-sm ${sortBy === "mark" ? "text-orange-400" : "text-neutral-300"}`}>
                    {r.best_mark}
                  </span>
                )}
                <span className={`font-mono text-sm w-12 text-right ${sortBy === "points" ? "text-orange-400" : "text-neutral-300"}`}>
                  {r.points}
                </span>
              </span>
            </div>
          ))}
        {!loading && !isRelay &&
          (visibleRows as RankingRow[]).map((r, i) => (
            <Link
              key={r.athlete_id}
              href={`/athletes/${r.athlete_id}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-neutral-800"
            >
              <span className="text-sm flex items-center gap-2 min-w-0 flex-1">
                <span className="text-neutral-500 font-mono text-xs w-6 shrink-0">
                  {(page - 1) * pageSize + i + 1}
                </span>
                <Avatar src={r.photo} name={r.display_name} />
                <Flag code={r.nationality} />
                <span className="truncate">{r.display_name}</span>
                {r.birth_year && (
                  <span className="hidden sm:inline text-xs text-neutral-500 shrink-0">b. {r.birth_year}</span>
                )}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                {r.best_mark && (
                  <span className="flex items-center gap-1.5">
                    <WindBadge wind={r.best_mark_wind ?? null} windLegal={r.best_mark_wind_legal ?? null} />
                    <span className={`font-mono text-sm ${sortBy === "mark" ? "text-orange-400" : "text-neutral-300"}`}>
                      {r.best_mark}
                    </span>
                  </span>
                )}
                <span className={`font-mono text-sm w-12 text-right ${isGlobal || sortBy === "points" ? "text-orange-400" : "text-neutral-300"}`}>
                  {r.points}
                </span>
              </span>
            </Link>
          ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-4 text-xs text-neutral-500">No results for this selection.</div>
        )}
      </div>

      {!loading && !showAll && page === 1 && total > 20 && (
        <div className="flex justify-center mt-3">
          <button onClick={() => setShowAll(true)} className="text-xs px-3 py-1.5 rounded bg-neutral-800 text-orange-400 hover:bg-neutral-700">
            Show all {total} ↓
          </button>
        </div>
      )}

      {!loading && (showAll || page > 1) && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-xs text-neutral-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
