import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import { flagUrlWide } from "@/lib/flags";
import {
  COUNTED_ATHLETES,
  TIERS,
  getCountryRanking,
  getCountryYears,
  parseCountryFilters,
  type CountryFilters,
  type CountryRankingRow,
} from "@/lib/countries";

export const revalidate = 3600;

// Countries, in the spirit of the ProCyclingStats teams page: the ranking
// split in blocks of eight (Gold / Silver / Bronze), each block as a
// two-column name list plus a grid of big flags, then everyone else.

const AGES = ["", "U23", "U20", "U18"] as const;

function hrefWith(year: number, f: CountryFilters, over: Partial<{ year: number; gender: string; age: string }>) {
  const qs = new URLSearchParams();
  qs.set("year", String(over.year ?? year));
  qs.set("gender", over.gender ?? f.gender);
  const age = over.age !== undefined ? over.age : f.age ?? "";
  if (age) qs.set("age", age);
  return `/countries?${qs.toString()}`;
}

function countryHref(code: string, year: number, f: CountryFilters) {
  const qs = new URLSearchParams({ year: String(year), gender: f.gender });
  if (f.age) qs.set("age", f.age);
  return `/countries/${code}?${qs.toString()}`;
}

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; gender?: string; age?: string }>;
}) {
  const sp = await searchParams;
  const years = await getCountryYears();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const f = parseCountryFilters(sp);
  const rows = await getCountryRanking(year, f);

  const pill = (active: boolean) =>
    `text-xs px-2.5 py-1 rounded-full border ${active ? "bg-neutral-100 text-black border-neutral-100" : "border-neutral-700 text-neutral-400 hover:text-neutral-200"}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-1">Countries</h1>
        <p className="text-sm text-neutral-500 mb-4">
          Each country scores the season points of its {COUNTED_ATHLETES} best athletes. Top 8 are Gold, next 8
          Silver, next 8 Bronze.
        </p>

        {/* Filters: year, gender, category */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <form action="/countries" className="flex items-center gap-2">
            <input type="hidden" name="gender" value={f.gender} />
            {f.age && <input type="hidden" name="age" value={f.age} />}
            <select
              name="year"
              defaultValue={year}
              className="bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="text-xs px-2.5 py-1.5 rounded bg-neutral-800 border border-neutral-700 hover:border-neutral-500">
              Go
            </button>
          </form>
          <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
            {(["Men", "Women"] as const).map((g) => (
              <Link
                key={g}
                href={hrefWith(year, f, { gender: g })}
                className={`px-2.5 py-1 rounded ${f.gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {g}
              </Link>
            ))}
          </div>
          <div className="flex gap-1">
            {AGES.map((a) => (
              <Link key={a || "all"} href={hrefWith(year, f, { age: a })} className={pill((f.age ?? "") === a)}>
                {a || "All ages"}
              </Link>
            ))}
          </div>
        </div>

        {TIERS.map((t) => {
          const block = rows.filter((r) => r.rank >= t.from && r.rank <= t.to);
          if (block.length === 0) return null;
          return (
            <section key={t.key} className="mb-10">
              <h2 className={`text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${t.color}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${t.bg}`} />
                {t.label}
                <span className="text-neutral-500 normal-case font-normal">· {t.from}–{t.to}</span>
              </h2>
              <div className="sm:columns-2 gap-x-10 mb-4">
                {block.map((r) => (
                  <CountryLine key={r.code} r={r} href={countryHref(r.code, year, f)} />
                ))}
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {block.map((r) => {
                  const src = flagUrlWide(r.code, 160);
                  return (
                    <Link
                      key={r.code}
                      href={countryHref(r.code, year, f)}
                      title={`${r.rank}. ${r.name} — ${r.points} pts`}
                      className={`group flex flex-col items-center gap-1 rounded-lg border ${t.border} bg-neutral-900/40 p-2 hover:bg-neutral-800`}
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={r.name} className="w-full aspect-[3/2] object-cover rounded shadow" />
                      ) : (
                        <span className="w-full aspect-[3/2] rounded bg-neutral-800 flex items-center justify-center text-xs">
                          {r.code}
                        </span>
                      )}
                      <span className="text-[11px] text-neutral-400 group-hover:text-neutral-200">{r.code}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {rows.length > 24 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 text-neutral-400">Rest of the world</h2>
            <div className="sm:columns-2 lg:columns-3 gap-x-10">
              {rows
                .filter((r) => r.rank > 24)
                .map((r) => (
                  <CountryLine key={r.code} r={r} href={countryHref(r.code, year, f)} />
                ))}
            </div>
          </section>
        )}

        {rows.length === 0 && <p className="text-sm text-neutral-500">No ranked countries for this selection.</p>}
      </main>
    </div>
  );
}

function CountryLine({ r, href }: { r: CountryRankingRow; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 py-1 text-sm hover:text-orange-400 break-inside-avoid">
      <span className="w-6 text-right text-xs text-neutral-500 tabular-nums">{r.rank}</span>
      <Flag code={r.code} />
      <span className="truncate">{r.name}</span>
      <span className="ml-auto font-mono text-xs text-orange-400 tabular-nums">{r.points}</span>
      <span
        className="w-10 text-right text-[11px] text-neutral-500 tabular-nums"
        title={`${r.n_counted} of ${COUNTED_ATHLETES} scoring places filled`}
      >
        ({r.n_counted})
      </span>
    </Link>
  );
}
