"use client";

import { useEffect, useRef, useState } from "react";

// A date field with its own English calendar. The native <input type="date">
// follows the browser/OS language (Spanish months on a Spanish device) and
// renders as a blank box on iOS while empty, so this draws its own button
// ("From"/"To" while empty, "13 Sep 2025" once set) and popup. Submits the
// ISO date through a hidden input and fires a bubbling `change` event so the
// auto-submitting filter form picks it up, same as MultiSelectDropdown.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function fmt(v: string) {
  const [y, m, d] = v.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

export default function DateField({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue?: string;
  label: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const today = new Date();
  const seed = value ? value.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
  const [view, setView] = useState({ y: seed[0], m: seed[1] - 1 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", () => setOpen(false));
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - 232);
      setPos({ top: r.bottom + 4, left: Math.max(8, left) });
      if (value) {
        const [y, m] = value.split("-").map(Number);
        setView({ y, m: m - 1 });
      }
    }
    setOpen(!open);
  }

  function pick(next: string) {
    setValue(next);
    setOpen(false);
    // The hidden input's value only updates after React renders; set it now
    // so the form reads the new date when the change event fires.
    if (hidden.current) {
      hidden.current.value = next;
      hidden.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function shift(dm: number) {
    const t = view.y * 12 + view.m + dm;
    setView({ y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 });
  }

  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday-first
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div ref={ref} className="relative shrink-0 w-[6.5rem]">
      <input ref={hidden} type="hidden" name={name} defaultValue={defaultValue} />
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className={`block w-full h-[30px] bg-neutral-800 text-xs text-left rounded px-2 border border-neutral-700 focus:outline-none focus:border-orange-500 truncate ${
          value ? "" : "text-neutral-400"
        }`}
      >
        {value ? fmt(value) : label}
      </button>
      {open && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-30 w-56 bg-neutral-800 border border-neutral-700 rounded shadow-lg p-2 text-xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <button type="button" onClick={() => shift(-12)} aria-label="Previous year" className="px-1.5 py-0.5 rounded hover:bg-neutral-700">«</button>
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="px-1.5 py-0.5 rounded hover:bg-neutral-700">‹</button>
            <span className="flex-1 text-center font-semibold">{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="px-1.5 py-0.5 rounded hover:bg-neutral-700">›</button>
            <button type="button" onClick={() => shift(12)} aria-label="Next year" className="px-1.5 py-0.5 rounded hover:bg-neutral-700">»</button>
          </div>
          <div className="grid grid-cols-7 text-center text-neutral-500 mb-0.5">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 text-center">
            {cells.map((d, i) =>
              d === null ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(iso(view.y, view.m, d))}
                  className={`py-1 rounded ${iso(view.y, view.m, d) === value ? "bg-orange-500 text-black font-semibold" : "hover:bg-neutral-700"}`}
                >
                  {d}
                </button>
              )
            )}
          </div>
          {value && (
            <button type="button" onClick={() => pick("")} className="mt-1.5 w-full text-center text-neutral-400 hover:text-orange-400">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
