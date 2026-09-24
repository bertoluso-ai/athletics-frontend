"use client";

import { useEffect, useState } from "react";
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

type Gender = "" | "Men" | "Women";

type CompetitionListRow = {
  event_name: string;
  display_series_name: string | null;
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

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search raw competition name…"
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
            <option key={t.value} value={t.value}>{t.label}</option>
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
        {!loading && `${rows.length} competitions${rows.length === 300 ? "+ (narrow the filters)" : ""}`}
      </div>

      <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
        {loading && <div className="px-4 py-4 text-xs text-neutral-500">Loading…</div>}
        {!loading &&
          rows.map((r) => (
            <Link
              key={r.event_name}
              href={`/competitions/${encodeURIComponent(r.event_name)}${year ? `?year=${year}` : ""}`}
              className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-neutral-800"
            >
              <span className="min-w-0">
                <span className="text-sm block truncate">{r.event_name}</span>
                {r.display_series_name && r.display_series_name !== r.event_name && (
                  <span className="text-[11px] text-orange-400/80 block truncate">→ {r.display_series_name}</span>
                )}
              </span>
              <span className="flex items-center gap-3 shrink-0 text-xs text-neutral-500">
                {r.tiers.length > 0 && <span className="font-mono">{r.tiers.join("/")}</span>}
                <span>
                  {r.min_year === r.max_year ? r.min_year : `${r.min_year}–${r.max_year}`}
                  {r.n_editions > 1 && ` (${r.n_editions})`}
                </span>
              </span>
            </Link>
          ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-4 text-xs text-neutral-500">No competitions match this selection.</div>
        )}
      </div>
    </div>
  );
}
