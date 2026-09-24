"use client";

import { useRouter } from "next/navigation";

type AgeCategory = "" | "U18" | "U20" | "U23";

const AGE_CATEGORIES: { value: AgeCategory; label: string }[] = [
  { value: "", label: "Senior (all ages)" },
  { value: "U23", label: "U23" },
  { value: "U20", label: "U20" },
  { value: "U18", label: "U18" },
];

const LIMITS = [10, 20, 100];

// Page-wide filters only (apply to both All-Time Best and Best of Year):
// age category and how many rows to show. Year is scoped to just the
// "Best of Year" column, so it lives next to that heading instead.
export default function EventFilters({
  year,
  ageCategory,
  limit,
  baseHref,
}: {
  year: number;
  ageCategory: string;
  limit: number;
  baseHref: string;
}) {
  const router = useRouter();

  function go(nextAge: string, nextLimit: number) {
    const params = new URLSearchParams({ year: String(year) });
    if (nextAge) params.set("age", nextAge);
    if (nextLimit !== 10) params.set("limit", String(nextLimit));
    router.push(`${baseHref}?${params.toString()}`);
  }

  const selectClass =
    "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";

  return (
    <div className="flex items-center gap-2">
      <select value={ageCategory} onChange={(e) => go(e.target.value, limit)} className={selectClass}>
        {AGE_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
        {LIMITS.map((l) => (
          <button
            key={l}
            onClick={() => go(ageCategory, l)}
            className={`px-2 py-1 rounded ${limit === l ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
