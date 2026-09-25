"use client";

import { useEffect, useState } from "react";

export type PhotoCreditItem = { who: string; credit: string; url: string };

// Licence credits for the page's photos (CC BY / BY-SA require them), as a
// small toast in the bottom-right corner: shown on load, folds itself into
// a discreet "Photo credits" pill after a few seconds, reopens on click.
// Sits above the floating mobile nav on phones.
export default function PhotoCreditsToast({ items }: { items: PhotoCreditItem[] }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(t);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed z-40 right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-4 max-w-[min(22rem,calc(100vw-1.5rem))]">
      {open ? (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900/95 backdrop-blur shadow-xl px-3 py-2 text-[11px] text-neutral-300">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="font-semibold text-neutral-200">Photo credits</span>
            <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-200" aria-label="Close">
              ✕
            </button>
          </div>
          <ul className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
            {items.map((it) => (
              <li key={it.url + it.who}>
                <span className="text-neutral-400">{it.who}: </span>
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 underline decoration-neutral-600">
                  {it.credit.replace(/^Photo:?\s*/, "")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="ml-auto block rounded-full border border-neutral-700 bg-neutral-900/90 px-2.5 py-1 text-[10px] text-neutral-400 hover:text-neutral-200 shadow"
        >
          ⓘ Photo credits
        </button>
      )}
    </div>
  );
}
