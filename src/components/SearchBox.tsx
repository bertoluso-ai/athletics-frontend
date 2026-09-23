"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SearchResult } from "@/app/api/search/route";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  athlete: "Athlete",
  event: "Event",
  discipline: "Discipline",
};

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => !cancelled && setResults(data));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-[22rem]">
      <input
        type="text"
        placeholder="Search athletes, events…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-orange-500"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden shadow-lg z-50 max-h-96 overflow-y-auto">
          {results.map((r, i) => (
            <Link
              key={i}
              href={r.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-3 py-2 hover:bg-neutral-800 text-sm"
            >
              <span className="truncate">
                {r.label}
                {r.sublabel && <span className="text-neutral-500 ml-1.5 text-xs">{r.sublabel}</span>}
              </span>
              <span className="text-[10px] text-neutral-500 uppercase shrink-0 ml-2">{TYPE_LABEL[r.type]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
