"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, TIER_LABELS, eventLabel } from "@/lib/events";

// Flattened, deduped list of every individual discipline the site
// normalizes results into -- same catalog as the Rankings/meet-page
// discipline selects, just not split by gender here.
const DISCIPLINE_OPTIONS = Array.from(
  new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women]))
)
  .sort((a, b) => eventLabel(a).localeCompare(eventLabel(b)))
  .map((value) => ({ value, label: eventLabel(value) }));

function tierLabel(code: string) {
  return TIER_LABELS.find((t) => t.value === code)?.label ?? code;
}

type Gender = "" | "Men" | "Women";

type CompetitionListRow = {
  event_name: string;
  display_series_name: string | null;
  series_key: string | null;
  tiers: string[];
  min_year: number;
  max_year: number;
  n_editions: number;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1979 }, (_, i) => CURRENT_YEAR - i);

// Debugging/QA tool as much as a public browser: shows the RAW, un-
// normalized event_name (as scraped) next to whatever series it actually
// got grouped under -- lets us spot both over-merging (two different
// competitions sharing one series, e.g. "European Team Championships"
// under "European Championships") and under-merging (a recurring meet
// split across several sponsor-name spellings, e.g. Memorial Van Damme)
// at a glance, filtered by the same facets as the rest of the site.
export default function CompetitionsExplorer() {
  const [gender, setGender] = useState<Gender>("");
  const [tier, setTier] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [categoryKey, setCategoryKey] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [rows, setRows] = useState<CompetitionListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (gender) params.set("gender", gender);
    if (tier) params.set("tier", tier);
    if (year) params.set("year", String(year));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (discipline) {
      params.set("disciplines", discipline);
    } else {
      const category = EVENT_GROUPS.find((g) => g.key === categoryKey);
      if (category) {
        const disciplines = Array.from(new Set([...category.events.Men, ...category.events.Women]));
        params.set("disciplines", disciplines.join(","));
      }
    }
    fetch(`/api/competitions?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [gender, tier, year, categoryKey, discipline, debouncedSearch]);

  const selectClass =
    "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";

  // Grouped by series_key -- the SAME normalized key the real
  // /meets/[name] page groups editions by (MEET_SERIES_MATCH_SQL
  // compares normalizeSeries(display_series_name), not the raw stored
  // value). Grouping this list by the raw display_series_name instead
  // would show fragmentation that isn't real: e.g. "World Athletics
  // Championships, Budapest" and "World Championships" already merge on
  // the real page (both normalize to the same key), even though their
  // stored display_series_name differs. Since any raw name in the group
  // works as a /meets/ entry point (the real page pulls in every
  // sibling via the same key), the group links to whichever raw name has
  // the most editions -- just the most likely to be recognizable, not a
  // "canonical" pick.
  const seriesGroups = useMemo(() => {
    const groups = new Map<string, CompetitionListRow[]>();
    for (const r of rows) {
      const key = r.series_key ?? r.display_series_name ?? r.event_name;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .map(([seriesKey, entries]) => {
        const sorted = entries.sort((a, b) => a.event_name.localeCompare(b.event_name));
        const representative = [...entries].sort((a, b) => b.n_editions - a.n_editions)[0];
        return {
          seriesKey,
          seriesName: representative.display_series_name ?? representative.event_name,
          linkName: representative.event_name,
          entries: sorted,
        };
      })
      .sort((a, b) => a.seriesName.localeCompare(b.seriesName));
  }, [rows]);

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by normalized series name or raw name…"
        className={`${selectClass} w-full mb-3`}
      />

      <div className="flex items-center gap-2 mb-3">
        <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className={`${selectClass} flex-1 min-w-0`}>
          <option value="">All genders</option>
          <option value="Men">Men</option>
          <option value="Women">Women</option>
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={`${selectClass} flex-1 min-w-0`}>
          <option value="">All tiers</option>
          {TIER_LABELS.map((t) => (
            <option key={t.value} value={t.value}>{t.value}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
          className={`${selectClass} flex-1 min-w-0`}
        >
          <option value="">All years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <select
        value={discipline}
        onChange={(e) => {
          setDiscipline(e.target.value);
          if (e.target.value) setCategoryKey("");
        }}
        className={`${selectClass} w-full mb-3`}
      >
        <option value="">All disciplines (normalized)</option>
        {DISCIPLINE_OPTIONS.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>

      <div className="pill-row flex flex-nowrap overflow-x-auto gap-1 mb-4">
        <button
          onClick={() => {
            setCategoryKey("");
            setDiscipline("");
          }}
          className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
            categoryKey === "" && !discipline ? "bg-orange-500 text-black border-orange-500 font-semibold" : "border-neutral-700 text-neutral-400"
          }`}
        >
          All disciplines
        </button>
        {EVENT_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => {
              setCategoryKey(g.key);
              setDiscipline("");
            }}
            className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
              categoryKey === g.key && !discipline ? "bg-neutral-100 text-black border-neutral-100" : "border-neutral-700 text-neutral-400"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-neutral-500 mb-2">
        {!loading &&
          `${seriesGroups.length} normalized series, ${rows.length} raw names${rows.length === 300 ? "+ (narrow the filters)" : ""}`}
      </div>

      {loading && <div className="px-4 py-4 text-xs text-neutral-500 border border-neutral-800 rounded-lg">Loading…</div>}

      {!loading && (
        <div className="flex flex-col gap-4">
          {seriesGroups.map((g) => (
            <div key={g.seriesKey} className="border border-neutral-800 rounded-lg overflow-hidden">
              <Link
                href={`/meets/${encodeURIComponent(g.linkName)}${year ? `?year=${year}` : ""}`}
                className="px-4 py-2 bg-neutral-900 flex items-center justify-between gap-3 hover:bg-neutral-800"
              >
                <span className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500 block">Shown to users as</span>
                  <span className="text-sm font-semibold text-orange-400 truncate block">{g.seriesName} ↗</span>
                </span>
                {g.entries.length > 1 && (
                  <span className="text-[11px] text-neutral-500 shrink-0">{g.entries.length} raw names</span>
                )}
              </Link>
              <div className="divide-y divide-neutral-800">
                {g.entries.map((r) => (
                  <Link
                    key={r.event_name}
                    href={`/competitions/${encodeURIComponent(r.event_name)}${year ? `?year=${year}` : ""}`}
                    className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-neutral-800"
                  >
                    <span className="min-w-0">
                      <span className={`text-sm block truncate ${r.event_name !== g.linkName ? "text-neutral-300" : ""}`}>
                        {r.event_name}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 text-xs text-neutral-500">
                      {r.tiers.map((t) => (
                        <span key={t} title={tierLabel(t)} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                          {t}
                        </span>
                      ))}
                      <span>
                        {r.min_year === r.max_year ? r.min_year : `${r.min_year}–${r.max_year}`}
                        {r.n_editions > 1 && ` (${r.n_editions})`}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {seriesGroups.length === 0 && (
            <div className="px-4 py-4 text-xs text-neutral-500 border border-neutral-800 rounded-lg">
              No competitions match this selection.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
