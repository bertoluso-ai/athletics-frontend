"use client";

import { useEffect, useState, type ReactNode } from "react";

// A list that behaves differently per device:
//   desktop (lg+): the first `initial` rows and a "View all" toggle
//   phones: every row -- inside a scroll box when `scrollOnMobile`, as the
//   lists always worked on phones
// `header` (e.g. sortable column titles) stays on top in both cases.
export default function ViewAllList({
  items,
  initial,
  noun,
  header,
  scrollOnMobile = false,
}: {
  items: ReactNode[];
  initial: number;
  noun: string;
  header?: ReactNode;
  scrollOnMobile?: boolean;
}) {
  const [isDesktop, setIsDesktop] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showAll = !isDesktop || expanded;
  const shown = showAll ? items : items.slice(0, initial);
  const box = `border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden ${
    !isDesktop && scrollOnMobile ? "max-h-[36rem] overflow-y-auto" : ""
  }`;

  return (
    <>
      <div className={box}>
        {header}
        {shown}
      </div>
      {isDesktop && items.length > initial && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 py-1 text-xs text-orange-400 hover:underline">
          {expanded ? "Show fewer ↑" : `View all ${items.length} ${noun} ↓`}
        </button>
      )}
    </>
  );
}
