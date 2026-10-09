"use client";

import { useState } from "react";

// A date input that shows its own "From"/"To" caption while empty. iOS Safari
// renders an empty <input type="date"> as a blank box (no "dd/mm/yyyy"
// placeholder like desktop Chrome), so the field looked like dead space; here
// the native placeholder text is hidden and the caption takes its place on
// every platform. Fixed width so it lines up with the other controls instead
// of growing to the browser's default date-input size.
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
  return (
    <div className="relative shrink-0 w-[6.5rem]">
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
        title={label}
        className={`block w-full h-[30px] appearance-none bg-neutral-800 text-xs text-left rounded px-2 border border-neutral-700 focus:outline-none focus:border-orange-500 ${
          value ? "" : "[&::-webkit-datetime-edit]:opacity-0"
        }`}
      />
      {!value && (
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-neutral-400">{label}</span>
      )}
    </div>
  );
}
