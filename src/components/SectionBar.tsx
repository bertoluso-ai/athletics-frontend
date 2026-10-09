import Link from "next/link";

// Dark section header shared by every block of the home page (All results,
// Upcoming races, Best mark by year, Athletes, Nations, Races).
export default function SectionBar({ title, href, linkLabel = "View all →" }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-neutral-100 text-white px-3 sm:px-4 py-2 rounded-lg mb-3">
      <h2 className="text-[11px] font-bold uppercase tracking-wider">{title}</h2>
      {href && (
        <Link href={href} className="text-[11px] text-neutral-600 hover:text-orange-400 shrink-0">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
