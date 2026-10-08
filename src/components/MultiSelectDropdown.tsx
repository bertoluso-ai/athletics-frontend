"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string; title?: string };

// A closed dropdown button (like a native <select>) that opens a checklist
// instead of a single-choice list, so several options can be picked without
// the "a whole row of pills" look. Checkboxes submit as repeated
// `name=value` fields -- same as a native <select multiple> -- so the
// surrounding <form> and the server-side parsing need no special handling.
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
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = (v: string) => setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  // Tell a surrounding auto-submitting form that the selection changed (the
  // hidden inputs below don't fire `change` themselves). Runs after render so
  // the form reads the updated hidden inputs; skipped on mount.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    ref.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selected]);

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
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 text-left truncate"
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg p-1 max-h-60 overflow-y-auto min-w-full whitespace-nowrap">
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
      )}
    </div>
  );
}
