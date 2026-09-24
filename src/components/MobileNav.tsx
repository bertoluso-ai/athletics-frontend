"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile-only bottom bar, replacing the top nav links on small screens
// (Header already hides those via `hidden sm:flex`). Calendar isn't its
// own page yet -- it points at Home, same as the desktop nav -- so for
// now this only lists what actually has a destination. Add more items
// here as new sections get built.
const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Rankings", href: "/rankings" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-neutral-900 border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs ${
              active ? "text-orange-400" : "text-neutral-400"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-orange-400" : "bg-neutral-600"}`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
