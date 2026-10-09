"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon, { type NavIconName } from "./NavIcons";

// Mobile-only bottom bar, replacing the top nav links on small screens
// (Header already hides those via `hidden sm:flex`). Floating pill in the
// style of WhatsApp/Strava: inset from the screen edges, rounded, blurred
// translucent background, active tab highlighted with a filled pill.
// Add more items here as new sections get built.
const NAV_ITEMS: { label: string; href: string; icon: NavIconName }[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Meets", href: "/meets", icon: "meets" },
  { label: "Rankings", href: "/rankings", icon: "rankings" },
  { label: "Countries", href: "/countries", icon: "countries" },
  { label: "Disciplines", href: "/disciplines", icon: "disciplines" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sm:hidden fixed z-50 left-4 right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-1 p-1.5 rounded-full bg-neutral-800/85 backdrop-blur-md border border-neutral-700/60 shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-full text-[9.5px] font-medium transition-colors ${
              active ? "bg-orange-500/20 text-orange-400" : "text-neutral-300"
            }`}
          >
            <NavIcon name={item.icon} className="w-[18px] h-[18px]" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
