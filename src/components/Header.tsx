"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchBox from "./SearchBox";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Rankings", href: "/rankings" },
  { label: "Competitions", href: "/competitions" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-800 bg-neutral-900">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 flex items-center gap-3 sm:gap-8">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="font-black tracking-tight text-lg bg-orange-500 text-black px-2.5 py-1 rounded">
            AIR
          </span>
          <span className="hidden md:inline text-xs text-neutral-500 tracking-wide">
            athleticsinforanking.com
          </span>
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-neutral-300 shrink-0">
          {NAV_LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.label}
                href={l.href}
                className={`border-b-2 pb-1 ${
                  active ? "text-white border-orange-500" : "border-transparent hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 flex justify-end">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
