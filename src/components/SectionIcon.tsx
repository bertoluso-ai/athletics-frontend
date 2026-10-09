// Small line icons for the section bars of the home. Inline SVG, one stroke
// style, so they weigh nothing and always match the bar text colour family.
export type IconName = "stopwatch" | "trophy" | "calendar" | "chart" | "user" | "globe" | "bib";

const PATHS: Record<IconName, React.ReactNode> = {
  stopwatch: (
    <>
      <circle cx="12" cy="14" r="7.5" />
      <path d="M12 14V10M9.5 2.5h5M12 2.5V6.5M18.5 7.5l1.5-1.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 4v16h17" />
      <path d="M7 15l4-5 3 3 5-6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  bib: (
    <>
      <path d="M7 3h10l2 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6l2-3Z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
};

export default function SectionIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4 shrink-0 text-neutral-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
