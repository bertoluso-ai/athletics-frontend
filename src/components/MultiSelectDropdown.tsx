"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = { value: string; label: string; title?: string };

// A closed dropdown button (like a native <select>) that opens a checklist
// instead of a single-choice list, so several options can be picked without
// the "a whole row of pills" look. Checkboxes submit as repeated
// `name=value` fields -- same as a native <select multiple> -- so the
// surrounding <form> and the server-side parsing need no special handling.
//
// The list is `fixed`, positioned from the button's rect: inside a
// horizontally scrolling row (overflow-x:auto clips anything absolutely
// positioned) an `absolute` list would be cut off. It closes on scroll/resize
// since a fixed list would otherwise stay behind while its button moves.
//
// Several options can be ticked while it stays open: the selection is applied
// (the surrounding auto-submitting form is told via a bubbling `change`)
// ONCE, when the list closes -- click outside, Escape, the button again, or
// scroll/resize -- and only if it differs from what it was when opened.
export default function MultiSelectDropdown({
  name,
  options,
  defaultSelected,
  placeholder,
  className = "",
}: {
  name: string;
  options: Option[];
  defaultSelected: string[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // latest selection (event handlers below outlive renders) and the one the list opened with
  const selectedRef = useRef<string[]>(defaultSelected);
  const openedWith = useRef<string[]>(defaultSelected);
  const isOpen = useRef(false);

  const sameSet = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));

  function closeMenu() {
    if (!isOpen.current) return;
    isOpen.current = false;
    setOpen(false);
    // the hidden inputs already hold the final selection: tell the form once
    if (!sameSet(selectedRef.current, openedWith.current)) {
      ref.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const inside = (n: Node | null) => !!n && ((ref.current?.contains(n) ?? false) || (menuRef.current?.contains(n) ?? false));
      if (!inside(e.target as Node)) closeMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    // scrolling the list itself must not close it
    const close = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      closeMenu();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleOpen = () => {
    if (isOpen.current) {
      closeMenu();
      return;
    }
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, minWidth: r.width });
    }
    openedWith.current = selectedRef.current;
    isOpen.current = true;
    setOpen(true);
  };

  const toggle = (v: string) =>
    setSelected((prev) => {
      const next = prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
      selectedRef.current = next;
      return next;
    });

  const label =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? options
            .filter((o) => selected.includes(o.value))
            .map((o) => o.label)
            .join(", ")
        : `${selected.length} selected`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`w-full h-[30px] text-xs rounded px-2 border text-left truncate focus:outline-none focus:border-orange-500 ${
          selected.length > 0 ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-neutral-800 border-neutral-700"
        }`}
      >
        {label}
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          className="fixed z-30 bg-neutral-800 border border-neutral-700 rounded shadow-lg p-1 max-h-60 overflow-y-auto whitespace-nowrap"
        >
          {options.map((o) => (
            <label
              key={o.value}
              title={o.title}
              className="flex items-center gap-1.5 px-1.5 py-1 text-xs hover:bg-neutral-700 rounded cursor-pointer"
            >
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-orange-500" />
              {o.label}
            </label>
          ))}
        </div>
      , document.body)}
    </div>
  );
}
