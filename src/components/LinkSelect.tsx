"use client";

import { useRouter } from "next/navigation";

// A <select> that navigates: each option carries its own URL.
export default function LinkSelect({
  value,
  options,
  className = "",
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
  className?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href, { scroll: false });
      }}
      className={`bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700 focus:outline-none focus:border-orange-500 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
