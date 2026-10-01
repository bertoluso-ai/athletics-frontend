"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile-only bottom bar, replacing the top nav links on small screens
// (Header already hides those via `hidden sm:flex`). Floating pill in the
// style of WhatsApp/Strava: inset from the screen edges, rounded, blurred
// translucent background, active tab highlighted with a filled pill.
// Add more items here as new sections get built.
const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />,
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: (
      <path d="M7 2v2H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2h-2v2H9V2H7Zm-1 6h12v11H6V8Z" />
    ),
  },
  {
    label: "Rankings",
    href: "/rankings",
    icon: <path d="M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z" />,
  },
  {
    label: "Disciplines",
    href: "/disciplines",
    icon: (
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    ),
  },
  {
    label: "Countries",
    href: "/countries",
    icon: <path d="M5 21V4h1.5v1H19l-2.5 4.5L19 14H6.5v7H5Z" />,
  },
  {
    label: "Races",
    href: "/races",
    icon: (
      <path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Zm-1.2 13.4L7.2 11.8l1.4-1.4 2.2 2.2 4.6-4.6 1.4 1.4-6 6Z" />
    ),
  },
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
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor" aria-hidden="true">
              {item.icon}
            </svg>
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
