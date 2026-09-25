"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Flag from "./Flag";

type Hit = { type: string; label: string; sublabel?: string; href: string };

// Athlete search for the head-to-head: reuses /api/search, keeps athletes
// only, and on pick opens /h2h?a=<base>&b=<picked>.
export default function H2HPicker({ baseId, placeholder = "Search an athlete to compare…" }: { baseId: string; placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((rows: Hit[]) => setHits(rows.filter((r) => r.type === "athlete")))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-neutral-900 text-sm rounded px-3 py-2 border border-neutral-700 focus:outline-none focus:border-orange-500"
      />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full border border-neutral-700 rounded bg-neutral-900 shadow-lg divide-y divide-neutral-800">
          {hits.map((h) => {
            const id = h.href.split("/").pop()!;
            return (
              <button
                key={h.href}
                onClick={() => router.push(`/h2h?a=${baseId}&b=${id}`)}
                disabled={id === baseId}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
              >
                <Flag code={h.sublabel} />
                {h.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
