"use client";

import { useRouter } from "next/navigation";

export default function YearSelect({
  years,
  year,
  baseHref,
  className = "",
}: {
  years: number[];
  year: number;
  /** URL to navigate to, without the `year` param (may already contain other query params). */
  baseHref: string;
  className?: string;
}) {
  const router = useRouter();
  const separator = baseHref.includes("?") ? "&" : "?";

  return (
    <select
      value={year}
      onChange={(e) => router.push(`${baseHref}${separator}year=${e.target.value}`)}
      className={`bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500 ${className}`}
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
