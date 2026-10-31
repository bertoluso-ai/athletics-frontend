import Link from "next/link";
import SearchBox from "@/components/SearchBox";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-16 text-neutral-100">
      <p className="text-xs uppercase tracking-wider text-neutral-500">Error 404</p>
      <h1 className="mt-1 text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm text-neutral-400">
        The link may be outdated, or the athlete or meeting may have been merged with another one. Try a search or pick a section.
      </p>
      <div className="mt-5 max-w-md">
        <SearchBox />
      </div>
      <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[["/meets", "Meetings"], ["/rankings", "Rankings"], ["/countries", "Countries"], ["/disciplines", "Disciplines"]].map(([href, label]) => (
          <Link key={href} href={href} className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800">
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
