"use client";

import { useRouter } from "next/navigation";

type AgeCategory = "" | "U18" | "U20" | "U23";

const AGE_CATEGORIES: { value: AgeCategory; label: string }[] = [
  { value: "", label: "Senior (all ages)" },
  { value: "U23", label: "U23" },
  { value: "U20", label: "U20" },
  { value: "U18", label: "U18" },
];

// Page-wide filter only (applies to both All-Time Best and Best of Year):
// age category. Year is scoped to just the "Best of Year" column, so it
// lives next to that heading instead, and the results-count limit lives
// right above the two lists it actually controls (see ResultsLimit).
export default function EventFilters({
  year,
  ageCategory,
  limit,
  indoor,
  baseHref,
}: {
  // "all" (the disciplines page's all-time view) is left out of the URL
  // entirely, same as any other unset filter -- a concrete year is always
  // written out.
  year: number | "all";
  ageCategory: string;
  limit: number;
  indoor?: boolean;
  baseHref: string;
}) {
  const router = useRouter();

  function go(nextAge: string) {
    const params = new URLSearchParams();
    if (year !== "all") params.set("year", String(year));
    if (nextAge) params.set("age", nextAge);
    if (limit !== 10) params.set("limit", String(limit));
    // Always explicit, never just omitted when true -- some events (60m/
    // 60mH) default to indoor, so dropping a "false" would silently flip
    // back to that default instead of keeping whatever's showing now.
    if (indoor !== undefined) params.set("indoor", String(indoor));
    // baseHref may already carry its own query (e.g. "?gender=Men") --
    // appending another bare "?" would corrupt it into one malformed
    // query string instead of merging the two.
    const separator = baseHref.includes("?") ? "&" : "?";
    router.push(`${baseHref}${separator}${params.toString()}`);
  }

  const selectClass =
    "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500";

  return (
    <select value={ageCategory} onChange={(e) => go(e.target.value)} className={selectClass}>
      {AGE_CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  );
}
