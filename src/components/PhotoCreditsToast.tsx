"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type PhotoCreditItem = { who: string; credit: string; url: string };

// Licence credits for the page's photos (CC BY / BY-SA require them), kept
// out of the way: one small line at the very bottom of the page that
// expands into the list only when asked. Never floats over the content.
// It is rendered into the footer slot of the root layout (#photo-credits-slot)
// through a portal, so it ALWAYS sits at the bottom of the page no matter
// where on the page the photos (and this component) are.
export default function PhotoCreditsToast({ items }: { items: PhotoCreditItem[] }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("photo-credits-slot"));
  }, []);
  if (items.length === 0 || !slot) return null;
  return createPortal(
    <>
      <details className="text-[11px] text-neutral-600">
        <summary className="cursor-pointer select-none hover:text-neutral-400 w-fit">
          Photos: Wikimedia Commons · credits
        </summary>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {items.map((it) => (
            <li key={it.url + it.who}>
              <span className="text-neutral-500">{it.who}: </span>
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-300 underline decoration-neutral-700">
                {it.credit.replace(/^Photo:?\s*/, "")}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>,
    slot
  );
}
