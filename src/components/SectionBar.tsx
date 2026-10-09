import Link from "next/link";
import SectionIcon, { type IconName } from "./SectionIcon";

// Dark section header shared by every block of the home page (All results,
// Upcoming races, Best mark by year, Athletes, Nations, Races).
export default function SectionBar({ title, href, linkLabel = "View all →", icon }: { title: string; href?: string; linkLabel?: string; icon?: IconName }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-tint text-neutral-100 px-3 sm:px-4 py-2 rounded-lg mb-3">
      <h2 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide">
        {icon && <SectionIcon name={icon} />}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-[11px] font-semibold text-neutral-400 hover:text-orange-600 shrink-0">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
