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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-5xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Races</h1>

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Year</label>
            <LinkSelect
              value={String(year)}
              options={[
                { value: "all", label: "All-time", href: href({ year: "all", page: 1 }) },
                ...years.map((y) => ({ value: String(y), label: String(y), href: href({ year: y, page: 1 }) })),
              ]}
            />
          </div>
          <div className="flex rounded bg-neutral-800 p-0.5 text-xs h-[1.9rem]">
            {(["Men", "Women"] as const).map((g) => (
              <Link
                key={g}
                href={href({ gender: g, page: 1 })}
                className={`px-3 flex items-center rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {g}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Group</label>
            <LinkSelect
              value={groupKey}
              options={GROUPS.map((g) => ({
                value: g.key,
                label: g.label,
                href: href({ group: g.key, page: 1 }),
              }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Discipline</label>
            <LinkSelect
              value={event ?? ""}
              options={[
                { value: "", label: "All disciplines", href: href({ event: null, page: 1 }) },
                ...groupEvents.map((ev) => ({ value: ev, label: eventLabel(ev), href: href({ event: ev, page: 1 }) })),
              ]}
            />
          </div>
          <Link
            href={href({ indoor: !indoor, page: 1 })}
            title="Indoor and outdoor marks are separate ranking contexts in the sport (separate world records exist) -- never blended together here"
            className={`text-[11px] px-2.5 py-1.5 rounded-full border ${
              indoor ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "border-neutral-700 text-neutral-400"
            }`}
          >
            {indoor ? "Indoor" : "Outdoor"}
          </Link>
          <div className="flex rounded bg-neutral-800 p-0.5 text-xs h-[1.9rem] ml-auto">
            {(["quality", "recent"] as const).map((s) => (
              <Link
                key={s}
                href={href({ sort: s, page: 1 })}
                className={`px-3 flex items-center rounded ${sortBy === s ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {s === "quality" ? "Quality" : "Recent"}
              </Link>
            ))}
          </div>
        </div>

        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="hidden sm:grid grid-cols-[6rem_minmax(0,1.5fr)_minmax(0,1.5fr)_3.5rem_4rem] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
            <Link href={href({ sort: "recent", page: 1 })} className={`hover:text-neutral-200 ${sortBy === "recent" ? "text-orange-400" : ""}`}>
              Date{sortBy === "recent" ? " ▼" : ""}
            </Link>
            <span>Competition</span>
            <span>Top performance</span>
            <span>Level</span>
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
                className="block sm:grid grid-cols-[6rem_minmax(0,1.5fr)_minmax(0,1.5fr)_3.5rem_4rem] gap-x-3 items-center px-3 py-2.5 text-sm bg-neutral-900/40 hover:bg-neutral-800"
              >
                <span className="text-xs text-neutral-400 tabular-nums">{formatDate(r.date, r.year)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.event_name}</span>
                  <span className="block text-[11px] text-neutral-500 truncate">
                    {eventLabel(r.athletics_event)}
                    {r.round ? ` · ${r.round}` : ""}
                  </span>
                </span>
                <span className="min-w-0 text-xs truncate">
                  {r.top_athlete ? (
                    <>
                      <Flag code={r.top_nationality} className="mr-1 inline-block" />
                      {r.top_athlete} · <span className="font-mono text-orange-400">{r.top_mark}</span>
                    </>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </span>
                <span>
                  {r.tier && (
                    <span
                      title={TIER_LABELS.find((t) => t.value === r.tier)?.label ?? r.tier}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400"
                    >
                      {r.tier}
                    </span>
                  )}
                </span>
                <span className="text-right font-mono text-sm text-orange-400">{Math.round(r.race_level)}</span>
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
