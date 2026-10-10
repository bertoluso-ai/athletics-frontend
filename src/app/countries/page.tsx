import Link from "next/link";
import PageBar from "@/components/PageBar";
import LinkSelect from "@/components/LinkSelect";
import { RACE_TYPES, eventMatchesType } from "@/lib/raceTypes";
import { EVENT_GROUPS, eventLabel, sortEventsAlpha } from "@/lib/events";
import { AREAS } from "@/lib/country-data";
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

function hrefWith(year: number, f: CountryFilters, over: Partial<{ year: number; gender: string; age: string; type: string; event: string; area: string }>) {
  const qs = new URLSearchParams();
  qs.set("year", String(over.year ?? year));
  qs.set("gender", over.gender ?? f.gender);
  const age = over.age !== undefined ? over.age : f.age ?? "";
  if (age) qs.set("age", age);
  const type = over.type !== undefined ? over.type : f.type ?? "";
  if (type) qs.set("type", type);
  const event = over.event !== undefined ? over.event : f.event ?? "";
  if (event) qs.set("event", event);
  const area = over.area !== undefined ? over.area : f.area ?? "";
  if (area) qs.set("area", area);
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
  searchParams: Promise<{ year?: string; gender?: string; age?: string; type?: string; event?: string; area?: string }>;
}) {
  const sp = await searchParams;
  const years = await getCountryYears();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const f = parseCountryFilters(sp);
  const rows = await getCountryRanking(year, f);

  const selectClass = "shrink-0 bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";
  // Discipline list for the chosen gender, narrowed by the type (like Disciplines / Rankings).
  const eventOptions = sortEventsAlpha(
    Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events[f.gender]] as string[]))).filter((ev) => !f.type || eventMatchesType(ev, f.type))
  );

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <PageBar title="Countries" icon="countries" />
        <p className="text-sm text-neutral-500 mb-3">
          Each country scores the season points of its {COUNTED_ATHLETES} best athletes. Top 8 are Gold, next 8
          Silver, next 8 Bronze.
        </p>

        {/* Filters, same two-row layout as Disciplines: gender + year, then type, discipline and age.
            Every control navigates on change (no Go button). */}
        <div className="flex flex-col gap-2 mb-6 bg-neutral-950 border border-neutral-800 rounded-lg p-2 sm:p-3">
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
            <div className="shrink-0 flex rounded bg-neutral-800 p-0.5 text-xs">
              {(["Men", "Women"] as const).map((g) => (
                <Link
                  key={g}
                  href={hrefWith(year, f, { gender: g, event: "" })}
                  className={`px-3 py-1.5 rounded ${f.gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                >
                  {g}
                </Link>
              ))}
            </div>
            <LinkSelect
              value={String(year)}
              className={selectClass}
              options={years.map((y) => ({ value: String(y), label: String(y), href: hrefWith(year, f, { year: y }) }))}
            />
          </div>
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
            <LinkSelect
              value={f.type ?? ""}
              className={selectClass}
              options={[
                { value: "", label: "All types", href: hrefWith(year, f, { type: "", event: "" }) },
                ...RACE_TYPES.map((o) => ({ value: o.value, label: o.label, href: hrefWith(year, f, { type: o.value, event: "" }) })),
              ]}
            />
            <LinkSelect
              value={f.event ?? ""}
              className={selectClass}
              options={[
                { value: "", label: "All disciplines", href: hrefWith(year, f, { event: "" }) },
                ...eventOptions.map((ev) => ({ value: ev, label: eventLabel(ev), href: hrefWith(year, f, { event: ev }) })),
              ]}
            />
            <LinkSelect
              value={f.area ?? ""}
              className={selectClass}
              options={[
                { value: "", label: "All areas", href: hrefWith(year, f, { area: "" }) },
                ...Object.entries(AREAS).map(([code, name]) => ({ value: code, label: name, href: hrefWith(year, f, { area: code }) })),
              ]}
            />
            <LinkSelect
              value={f.age ?? ""}
              className={selectClass}
              options={AGES.map((a) => ({ value: a, label: a || "All ages", href: hrefWith(year, f, { age: a }) }))}
            />
          </div>
        </div>

        {TIERS.map((t) => {
          const block = rows.filter((r) => r.rank >= t.from && r.rank <= t.to);
          if (block.length === 0) return null;
          return (
            <section key={t.key} className="mb-10">
              <h2 className="flex items-center gap-2 bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${t.bg}`} />
                {t.label}
                <span className="text-neutral-400 normal-case font-medium text-xs">· {t.from}–{t.to}</span>
              </h2>
              <div className="sm:columns-2 gap-x-10 mb-4 bg-neutral-950 border border-neutral-800 rounded-lg px-3 sm:px-4 py-2">
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
                      className={`group flex flex-col items-center gap-1 rounded-lg border ${t.border} bg-neutral-950 p-2 hover:bg-neutral-800`}
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
            <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-3">Rest of the world</h2>
            <div className="sm:columns-2 lg:columns-3 gap-x-10 bg-neutral-950 border border-neutral-800 rounded-lg px-3 sm:px-4 py-2">
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
