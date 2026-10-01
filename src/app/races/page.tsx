import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import LinkSelect from "@/components/LinkSelect";
import { getTopRaces, getTopRacesCount, getRaceYears } from "@/lib/queries";
import { EVENT_GROUPS, eventLabel, TIER_LABELS } from "@/lib/events";

export const revalidate = 3600;

const PAGE_SIZE = 50;

const GROUPS = [
  {
    key: "all",
    label: "All",
    events: {
      Men: Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men]))),
      Women: Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Women]))),
    },
  },
  ...EVENT_GROUPS,
];

// Some historical sources (pre-2012 marathon majors, mainly) have no exact
// date on file, only the year -- show that instead of a bare dash so the
// row isn't dateless-looking (see RACE_KEY_SQL in queries.ts for how these
// are still scored as separate per-year races, not merged together).
function formatDate(iso: string | null, year: number | null) {
  if (!iso) return year ? String(year) : "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function RacesPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    gender?: string;
    group?: string;
    event?: string;
    sort?: string;
    indoor?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const years = await getRaceYears();
  const thisYear = new Date().getFullYear();
  const year: number | "all" =
    sp.year === "all" ? "all" : sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years.includes(thisYear) ? thisYear : years[0];
  const gender = sp.gender === "Women" ? "Women" : "Men";
  const groupKey = GROUPS.some((g) => g.key === sp.group) ? sp.group! : "all";
  const group = GROUPS.find((g) => g.key === groupKey)!;
  const groupEvents = group.events[gender] as readonly string[];
  // event is independent of groupKey (the Discipline dropdown can pick any
  // discipline regardless of which Group narrowed its option list) --
  // group only decides what that dropdown shows, not what's filtered.
  const allEvents = GROUPS[0].events[gender] as readonly string[];
  const event = sp.event && allEvents.includes(sp.event) ? sp.event : undefined;
  const isAll = event === undefined;
  const eventParam = event ?? "all";
  const sortBy = sp.sort === "recent" ? "recent" : "quality";
  const indoor = sp.indoor === "true";
  const page = Math.max(1, Number(sp.page) || 1);

  const [rows, total] = await Promise.all([
    getTopRaces(eventParam, gender, year, sortBy, PAGE_SIZE, indoor, page),
    getTopRacesCount(eventParam, gender, year, indoor),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);

  const href = (over: {
    year?: number | "all";
    gender?: string;
    group?: string;
    event?: string | null;
    sort?: string;
    indoor?: boolean;
    page?: number;
  }) => {
    const q = new URLSearchParams();
    q.set("year", String(over.year ?? year));
    q.set("gender", over.gender ?? gender);
    q.set("group", over.group ?? groupKey);
    const nextEvent = over.event === null ? undefined : over.event ?? event;
    if (nextEvent) q.set("event", nextEvent);
    q.set("sort", over.sort ?? sortBy);
    q.set("indoor", String(over.indoor ?? indoor));
    q.set("page", String(over.page ?? page));
    return `/races?${q.toString()}`;
  };
  const selectClass = "shrink-0 bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-5xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Races</h1>

        {/* Same two-pill-row look as Disciplines (compact, label-less
            LinkSelects, horizontally scrollable on narrow screens) instead
            of the old labelled-column layout -- no separate Quality/Recent
            toggle either: sorting now happens the same way a table does,
            by tapping the Date/Quality column headers below (visible on
            phones too, not just desktop). */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0">
            <div className="shrink-0 flex rounded bg-neutral-800 p-0.5 text-xs">
              {(["Men", "Women"] as const).map((g) => (
                <Link
                  key={g}
                  href={href({ gender: g, page: 1 })}
                  className={`px-3 py-1.5 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                >
                  {g}
                </Link>
              ))}
            </div>
            <Link
              href={href({ indoor: !indoor, page: 1 })}
              title="Indoor and outdoor marks are separate ranking contexts in the sport (separate world records exist) -- never blended together here"
              className={`shrink-0 text-xs px-2.5 py-1.5 rounded-full border ${
                indoor ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "border-neutral-700 text-neutral-400"
              }`}
            >
              {indoor ? "Indoor" : "Outdoor"}
            </Link>
            <LinkSelect
              value={String(year)}
              className={selectClass}
              options={[
                { value: "all", label: "All-time", href: href({ year: "all", page: 1 }) },
                ...years.map((y) => ({ value: String(y), label: String(y), href: href({ year: y, page: 1 }) })),
              ]}
            />
          </div>
          <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0">
            <LinkSelect
              value={groupKey}
              className={selectClass}
              options={GROUPS.map((g) => ({
                value: g.key,
                label: g.label,
                href: href({ group: g.key, page: 1 }),
              }))}
            />
            <LinkSelect
              value={event ?? ""}
              className={selectClass}
              options={[
                { value: "", label: "All disciplines", href: href({ event: null, page: 1 }) },
                ...groupEvents.map((ev) => ({ value: ev, label: eventLabel(ev), href: href({ event: ev, page: 1 }) })),
              ]}
            />
          </div>
        </div>

        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[5rem_1fr_3.5rem] sm:grid-cols-[6rem_minmax(0,1.5fr)_minmax(0,1.5fr)_3.5rem_4rem] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
            <Link href={href({ sort: "recent", page: 1 })} className={`hover:text-neutral-200 ${sortBy === "recent" ? "text-orange-400" : ""}`}>
              Date{sortBy === "recent" ? " ▼" : ""}
            </Link>
            <span className="hidden sm:inline">Competition</span>
            <span className="hidden sm:inline">Top performance</span>
            <span className="hidden sm:inline">Level</span>
            <Link href={href({ sort: "quality", page: 1 })} className={`text-right hover:text-neutral-200 ${sortBy === "quality" ? "text-orange-400" : ""}`}>
              Quality{sortBy === "quality" ? " ▼" : ""}
            </Link>
          </div>
          <div className="divide-y divide-neutral-800">
            {rows.map((r, i) => (
              <Link
                key={i}
                href={`/meets/${encodeURIComponent(r.event_name)}?${new URLSearchParams({
                  ...(r.date ? { year: r.date.slice(0, 4) } : r.year ? { year: String(r.year) } : {}),
                  discipline: r.athletics_event,
                  gender,
                }).toString()}`}
                className="flex flex-col gap-1 sm:grid sm:grid-cols-[6rem_minmax(0,1.5fr)_minmax(0,1.5fr)_3.5rem_4rem] sm:gap-x-3 sm:items-center px-3 py-2.5 text-sm bg-neutral-900/40 hover:bg-neutral-800"
              >
                {/* phones: date + tier + quality share one line up top, instead
                    of flowing inline after the event name/athlete text below
                    (that's what made the row look cramped -- plain <span>s
                    with no "block" of their own just ran into each other). */}
                <span className="flex sm:hidden items-center justify-between text-xs text-neutral-400">
                  <span className="tabular-nums">{formatDate(r.date, r.year)}</span>
                  <span className="flex items-center gap-1.5">
                    {r.tier && (
                      <span
                        title={TIER_LABELS.find((t) => t.value === r.tier)?.label ?? r.tier}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400"
                      >
                        {r.tier}
                      </span>
                    )}
                    <span className="font-mono text-orange-400">{Math.round(r.race_level)}</span>
                  </span>
                </span>
                <span className="hidden sm:inline text-xs text-neutral-400 tabular-nums">{formatDate(r.date, r.year)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.event_name}</span>
                  <span className="block text-[11px] text-neutral-500 truncate">
                    {eventLabel(r.athletics_event)}
                    {r.round ? ` · ${r.round}` : ""}
                  </span>
                </span>
                <span className="block min-w-0 text-xs truncate">
                  {r.top_athlete ? (
                    <>
                      <Flag code={r.top_nationality} className="mr-1 inline-block" />
                      {r.top_athlete} · <span className="font-mono text-orange-400">{r.top_mark}</span>
                    </>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </span>
                <span className="hidden sm:block">
                  {r.tier && (
                    <span
                      title={TIER_LABELS.find((t) => t.value === r.tier)?.label ?? r.tier}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400"
                    >
                      {r.tier}
                    </span>
                  )}
                </span>
                <span className="hidden sm:block text-right font-mono text-sm text-orange-400">{Math.round(r.race_level)}</span>
              </Link>
            ))}
            {rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No races for this selection.</div>}
          </div>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">
                ← Prev
              </Link>
            )}
            <span className="text-neutral-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            {page < pages && (
              <Link href={href({ page: page + 1 })} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">
                Next →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
