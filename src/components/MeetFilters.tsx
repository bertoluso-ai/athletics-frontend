"use client";

import { useRouter } from "next/navigation";

export type DisciplineOption = { value: string; label: string };
export type CategoryOption = { key: string; label: string };

export default function MeetFilters({
  disciplines,
  categories,
  category,
  genders,
  discipline,
  gender,
  baseHref,
  year,
}: {
  disciplines: DisciplineOption[];
  categories: CategoryOption[];
  category: string;
  genders: string[];
  discipline: string;
  gender: string;
  baseHref: string;
  year: number;
}) {
  const router = useRouter();

  function go(nextDiscipline: string, nextGender: string, nextCategory: string) {
    const params = new URLSearchParams({ year: String(year) });
    if (nextDiscipline) params.set("discipline", nextDiscipline);
    if (nextGender) params.set("gender", nextGender);
    if (nextCategory) params.set("category", nextCategory);
    router.push(`${baseHref}?${params.toString()}`);
  }

  const selectClass =
    "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";

  return (
    <div className="flex flex-col gap-2">
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => go("", gender, category === c.key ? "" : c.key)}
              className={`text-[10px] px-2 py-1 rounded-full border ${
                category === c.key
                  ? "bg-neutral-100 text-black border-neutral-100"
                  : "border-neutral-700 text-neutral-400"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={discipline} onChange={(e) => go(e.target.value, gender, category)} className={selectClass}>
          <option value="">All disciplines</option>
          {disciplines.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          <button
            onClick={() => go(discipline, "", category)}
            className={`px-2 py-1 rounded ${gender === "" ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
          >
            All
          </button>
          {genders.map((g) => (
            <button
              key={g}
              onClick={() => go(discipline, g, category)}
              className={`px-2 py-1 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
