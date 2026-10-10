import { Suspense } from "react";
import PageBar from "@/components/PageBar";
import { RACE_TYPES, eventMatchesType, type RaceType } from "@/lib/raceTypes";
import Link from "next/link";
import Flag from "@/components/Flag";
import { GenericAthlete } from "@/components/Avatar";
import LinkSelect from "@/components/LinkSelect";
import RankingsExplorer from "@/components/RankingsExplorer";
import PhotoCreditsToast from "@/components/PhotoCreditsToast";
import YearlyProgressionChart from "@/components/YearlyProgressionChart";
import ViewAllList from "@/components/ViewAllList";
import { getEventYearlyProgression, getAthleteSlugs, athleteHref } from "@/lib/queries";
import { isFieldEvent, sortEventsAlpha } from "@/lib/events";
import { getNationRanking, getCountryYears, tierForRank, COUNTED_ATHLETES, type NationView } from "@/lib/countries";
import { flagUrlWide } from "@/lib/flags";
import { AREAS } from "@/lib/country-data";
import { EVENT_GROUPS } from "@/lib/events";
import { eventLabel } from "@/lib/events";
import { getAthletePhotoInfo, getAthletePhotosBatch, photoCredit, type AthletePhoto } from "@/lib/wikipedia";
import {
  getIndividualRanking,
  getRankingNationalities,
  getRankingYears,
  hasMovement,
  type IndividualRankingRow,
  type RankingView,
} from "@/lib/rankings";

export const revalidate = 3600;

// Rankings, after the ProCyclingStats ranking page but with more picture:
// a podium of the top three with photos, a strip of the biggest climbers of
// the last two weeks, then the full table with Prev / Diff. The right-hand
// menu switches between season, rolling 12 months and wins, and keeps the
// per-discipline explorer (marks, wind, indoor, relays) one click away.

const PAGE_SIZE = 50;
const AGES = ["", "U23", "U20", "U18"] as const;

const MENU: { title: string; items: { label: string; view: string; help: string }[] }[] = [
  {
    title: "Athletes",
    items: [
      { label: "Season", view: "season", help: "Points scored in the selected season" },
      { label: "Rolling 12 months", view: "rolling", help: "Points over the last 365 days" },
      { label: "Wins", view: "wins", help: "Most wins, points as tie-break" },
    ],
  },
  {
    title: "Nations",
    items: [
      { label: "Season", view: "n-season", help: "Countries by the season points of their 24 best athletes" },
      { label: "Rolling 12 months", view: "n-rolling", help: "Same rule over the last 365 days" },
      { label: "Wins", view: "n-wins", help: "Countries by total wins" },
    ],
  },
];

type SP = { view?: string; gender?: string; year?: string; nationality?: string; age?: string; page?: string; event?: string; sort?: string; area?: string; type?: string };

// Race type narrows the discipline list. No Indoor here: rankings are outdoor
// season points, there is no indoor ranking to show.
const RANKING_TYPES = RACE_TYPES.filter((t) => t.value !== "indoor");
function rankingType(v?: string): RaceType | undefined {
  return RANKING_TYPES.find((t) => t.value === v)?.value;
}
const NATION_VIEWS = ["n-season", "n-rolling", "n-wins", "n-discipline"] as const;

// Same columns for the table header and every row.
// Mobile columns narrowed from the desktop widths (#/PREV/DIFF/POINTS
// don't need nearly as much room as the Athlete name does, and on a phone
// every spare rem matters -- names were truncating hard, e.g. "Miltiadis
// Tent...") -- also tightened the gap between columns on mobile only.
function cols(movement: boolean) {
  return movement
    ? "grid-cols-[1.5rem_1.75rem_2rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[2.5rem_2.5rem_2.75rem_minmax(0,1fr)_9rem_3rem_4rem]"
    : "grid-cols-[1.75rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_9rem_3rem_4rem]";
}

export default async function RankingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // links across the site (/rankings?event=...) mean the per-discipline explorer
  // old links: "nations", and the former "By discipline" tabs (the event is
  // now a filter of every view)
  const requested =
    sp.view === "nations" || sp.view === "n-discipline" ? "n-season" : sp.view === "discipline" ? "season" : sp.view;
  const view = (["season", "rolling", "wins", "discipline", ...NATION_VIEWS].includes(requested ?? "")
    ? requested
    : sp.event
    ? "discipline"
    : "season") as RankingView | "discipline" | (typeof NATION_VIEWS)[number];

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        {/* phones: the title goes above the Athletes/Nations switch (which the grid orders first);
            desktop: it sits over the left column so the side menu starts level with it */}
        <div className="lg:hidden">
          <PageBar title="Rankings" icon="rankings" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0">
            <div className="hidden lg:block">
              <PageBar title="Rankings" icon="rankings" />
            </div>
            {view.startsWith("n-") ? (
              <NationsRanking view={view.slice(2) as NationView} sp={sp} />
            ) : (
              <IndividualRanking view={view as RankingView} sp={sp} />
            )}
          </div>
          <SideMenu view={view} />
        </div>
      </main>
    </div>
  );
}

function SideMenu({ view }: { view: string }) {
  const nations = view.startsWith("n-");
  const section = MENU[nations ? 1 : 0];
  const short: Record<string, string> = { Season: "Season", "Rolling 12 months": "12 months", Wins: "Wins", "By discipline": "Discipline" };
  return (
    <>
      {/* phones: section toggle + the section's four views, full width */}
      <div className="lg:hidden order-first flex flex-col gap-2 w-full">
        <div className="grid grid-cols-2 w-full rounded-lg bg-neutral-800 p-1 text-sm">
          {MENU.map((m, i) => {
            const active = (i === 1) === nations;
            // switching section keeps the same kind of view (season <-> n-season)
            const target = i === 1 ? (nations ? view : `n-${view}`) : nations ? view.slice(2) : view;
            return (
              <Link
                key={m.title}
                href={`/rankings?view=${target}`}
                className={`h-8 flex items-center justify-center rounded-md font-semibold ${active ? "bg-orange-500 text-black" : "text-neutral-400"}`}
              >
                {m.title}
              </Link>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-1 w-full text-xs">
          {section.items.map((it) => (
            <Link
              key={it.view}
              href={`/rankings?view=${it.view}`}
              className={`h-8 flex items-center justify-center rounded-md border ${
                it.view === view ? "border-orange-500/60 bg-orange-500/15 text-orange-400 font-semibold" : "border-neutral-800 text-neutral-400"
              }`}
            >
              {short[it.label] ?? it.label}
            </Link>
          ))}
        </div>
      </div>

      {/* desktop: side menu */}
      <aside className="hidden lg:flex flex-col gap-6 min-w-0">
        {MENU.map((m) => (
          <section key={m.title}>
            <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-2">{m.title}</h2>
            <ul className="flex flex-col gap-1">
              {m.items.map((it) => {
                const active = it.view === view;
                return (
                  <li key={it.view}>
                    <Link
                      href={`/rankings?view=${it.view}`}
                      title={it.help}
                      className={`block whitespace-nowrap text-sm px-2.5 py-1.5 rounded ${
                        active ? "bg-orange-500/15 text-orange-400 font-semibold" : "text-neutral-300 hover:bg-neutral-900"
                      }`}
                    >
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </aside>
    </>
  );
}

async function IndividualRanking({ view, sp }: { view: RankingView; sp: SP }) {
  const currentYear = new Date().getFullYear();
  const gender = sp.gender === "Women" ? "Women" : "Men";
  const age = AGES.includes((sp.age ?? "") as (typeof AGES)[number]) ? sp.age || undefined : undefined;
  const nationality = sp.nationality || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  // optional discipline filter: the same ranking restricted to one event
  const type = rankingType(sp.type);
  const allEventOptions: string[] = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events[gender]])));
  const eventOptions = allEventOptions.filter((ev) => !type || eventMatchesType(ev, type));
  const event = sp.event && eventOptions.includes(sp.event) ? sp.event : undefined;
  const discipline = !!event;

  // years/nationalities/progression are independent of each other -- this
  // used to be 3 sequential awaits (plus the main ranking query only
  // starting after all 3 resolved) for no reason, same mistake as
  // Disciplines' two-batch Promise.all had. Confirmed live:
  // /rankings?event=100+Metres&gender=Men dropped noticeably once this and
  // the photo-fetch loop below were parallelized.
  const [years, nationalities, progression] = await Promise.all([
    getRankingYears(),
    getRankingNationalities(gender),
    event ? getEventYearlyProgression(event, gender, age) : Promise.resolve([]),
  ]);
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const movement = hasMovement(view, year, currentYear);
  const nationalityCodes = nationality ? nationalities.find((n) => n.code === nationality)?.codes ?? [nationality] : undefined;
  const sortBy: "points" | "mark" = discipline && sp.sort === "mark" ? "mark" : "points";
  const area = sp.area && sp.area in AREAS ? sp.area : undefined;
  // Narrow the nation dropdown to the selected area -- picking "Europe"
  // and then still being offered every country in the world (Afghanistan
  // included) made the two filters look unrelated instead of a refinement.
  const nationalityOptions = area ? nationalities.filter((n) => n.area === area) : nationalities;
  const params = { view, gender, year, nationality, nationalityCodes, age, event, sortBy, area } as const;
  const [{ rows, total }, top] = await Promise.all([
    getIndividualRanking({ ...params, page, pageSize: PAGE_SIZE }),
    // podium + climbers always come from the top of the (filtered) ranking
    getIndividualRanking({ ...params, page: 1, pageSize: 200 }),
  ]);
  const podium = top.rows.slice(0, 3);
  const climbers = movement
    ? top.rows
        .filter((r) => r.prev_rank !== null && r.prev_rank - r.rank >= 3)
        .sort((a, b) => b.prev_rank! - b.rank - (a.prev_rank! - a.rank))
        .slice(0, 4)
    : [];

  // Wikimedia lookups for the podium/climber photos are not cached the
  // way the ranking query itself is (unstable_cache above) -- confirmed
  // live as the dominant remaining cost on this page. Nothing else here
  // needs them, so <PodiumAndClimbers> fetches them in its own Suspense
  // boundary below instead of blocking the table/pagination on Wikimedia.
  const athleteSlugs = await getAthleteSlugs([...rows.map((r) => r.athlete_id), ...top.rows.map((r) => r.athlete_id)]);

  const href = (over: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { view, gender, year: String(year), nationality: nationality ?? "", age: age ?? "", event: event ?? "", sort: sortBy === "mark" ? "mark" : "", area: area ?? "", type: type ?? "", page: "1", ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, String(v));
    return `/rankings?${q.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectClass = "shrink-0 bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";

  return (
    <>

      {/* Filters: two rows, no submit button -- every control navigates as
          soon as it changes (gender/year are plain links, the rest are
          LinkSelects), same pill look as the rest of the site. */}
      <div className="flex flex-col gap-2 mb-4 bg-neutral-950 border border-neutral-800 rounded-lg p-2 sm:p-3">
        <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
          <div className="shrink-0 flex rounded bg-neutral-800 p-0.5 text-xs">
            {(["Men", "Women"] as const).map((g) => (
              <Link
                key={g}
                href={href({ gender: g, nationality: "", event: "" })}
                className={`px-3 py-1.5 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {g}
              </Link>
            ))}
          </div>
          {view !== "rolling" && (
            <LinkSelect
              value={String(year)}
              className={selectClass}
              options={years.map((y) => ({ value: String(y), label: String(y), href: href({ year: String(y) }) }))}
            />
          )}
        </div>
        <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
          <LinkSelect
            value={type ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All types", href: href({ type: "", event: "" }) },
              ...RANKING_TYPES.map((o) => ({ value: o.value, label: o.label, href: href({ type: o.value, event: allEventOptions.find((ev) => eventMatchesType(ev, o.value)) ?? "" }) })),
            ]}
          />
          <LinkSelect
            value={event ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All disciplines", href: href({ event: "" }) },
              ...sortEventsAlpha(eventOptions).map((e) => ({ value: e, label: eventLabel(e), href: href({ event: e }) })),
            ]}
          />
          <LinkSelect
            value={area ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All areas", href: href({ area: "", nationality: "" }) },
              ...Object.entries(AREAS).map(([k, v]) => ({ value: k, label: v, href: href({ area: k, nationality: "" }) })),
            ]}
          />
          <LinkSelect
            value={nationality ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All nations", href: href({ nationality: "" }) },
              ...nationalityOptions.map((n) => ({ value: n.code, label: n.name, href: href({ nationality: n.code }) })),
            ]}
          />
          <LinkSelect
            value={age ?? ""}
            className={selectClass}
            options={AGES.map((a) => ({ value: a, label: a || "All ages", href: href({ age: a }) }))}
          />
          {(nationality || age || area) && (
            <Link href={href({ nationality: "", age: "", area: "" })} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300">
              clear
            </Link>
          )}
        </div>
      </div>

      {/* Podium + biggest climbers: streams in on its own (see
          PodiumAndClimbers below), never blocks the table/pagination */}
      <Suspense fallback={<PodiumAndClimbersView podium={podium} climbers={climbers} photoOf={EMPTY_PHOTOS} view={view} gender={gender} athleteSlugs={athleteSlugs} page={page} />}>
        <PodiumAndClimbers podium={podium} climbers={climbers} view={view} gender={gender} athleteSlugs={athleteSlugs} page={page} />
      </Suspense>

      {/* Table: discipline view = top 20 + View all, then the chart */}
      {discipline ? (
        <>
          {/* rank by points or by best mark -- right above the table it sorts */}
          <div className="flex justify-end mb-2">
            <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
              {(["points", "mark"] as const).map((m) => (
                <Link
                  key={m}
                  href={href({ sort: m === "mark" ? "mark" : "" })}
                  scroll={false}
                  className={`px-3 py-1 rounded ${sortBy === m ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
                >
                  {m === "points" ? "Points" : "Mark"}
                </Link>
              ))}
            </div>
          </div>
          <ViewAllList
            noun="athletes"
            initial={20}
            scrollOnMobile
            header={
              <div className={`grid ${cols(movement)} gap-x-1 sm:gap-x-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500`}>
                <span>#</span>
                {movement && <span>Prev</span>}
                {movement && <span>Diff</span>}
                <span>Athlete</span>
                <span className={`hidden sm:block ${sortBy === "mark" ? "text-orange-400" : ""}`}>Best mark</span>
                <span className="hidden sm:block text-right">Wins</span>
                <span className="text-right">
                  <span className="sm:hidden">{sortBy === "mark" ? "Mark" : "Points"}</span>
                  <span className={`hidden sm:inline ${sortBy === "points" ? "text-orange-400" : ""}`}>Points</span>
                </span>
              </div>
            }
            items={top.rows.map((r) => <RankingLine key={r.athlete_id} r={r} movement={movement} discipline markFirst={sortBy === "mark"} athleteSlugs={athleteSlugs} />)}
          />
          {top.rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No athletes for this selection.</div>}
          {event && progression.length >= 2 && (
            <div className="mt-8">
              <ProgressionBox event={event} data={progression} />
            </div>
          )}
        </>
      ) : (
        <>
        {/* Table */}
        <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950">
          <div className={`grid ${cols(movement)} gap-x-1 sm:gap-x-2 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide bg-tint text-neutral-300`}>
            <span>#</span>
            {movement && <span>Prev</span>}
            {movement && <span>Diff</span>}
            <span>Athlete</span>
            <span className="hidden sm:block">{discipline ? "Best mark" : "Main event"}</span>
            <span className="hidden sm:block text-right">Wins</span>
            <span className="text-right">Points</span>
          </div>
          <div className="divide-y divide-neutral-800">
            {rows.map((r) => (
              <RankingLine key={r.athlete_id} r={r} movement={movement} discipline={discipline} athleteSlugs={athleteSlugs} />
            ))}
            {rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No athletes for this selection.</div>}
          </div>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm">
            {page > 1 && (
              <Link href={href({ page: String(page - 1) })} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">
                ← Prev
              </Link>
            )}
            <span className="text-neutral-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            {page < pages && (
              <Link href={href({ page: String(page + 1) })} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">
                Next →
              </Link>
            )}
          </div>
        )}
        </>
      )}
    </>
  );
}

const EMPTY_PHOTOS = new Map<string, AthletePhoto | null>();

// Async Server Component rendered inside a <Suspense> boundary -- streams
// in independently of the table/pagination above, which don't need these
// Wikimedia lookups at all.
async function PodiumAndClimbers({
  podium,
  climbers,
  view,
  gender,
  athleteSlugs,
  page,
}: {
  podium: IndividualRankingRow[];
  climbers: IndividualRankingRow[];
  view: RankingView;
  gender: string;
  athleteSlugs: Map<string, string>;
  page: number;
}) {
  const photoFor = [...podium, ...climbers];
  // One batched cache read for all of photoFor (at most 7: 3 podium + 4
  // climbers) instead of 7 separate round trips -- see
  // getAthletePhotosBatch's comment for why this mattered even though
  // these 7 used to fire in parallel already.
  const photoMap = await getAthletePhotosBatch(photoFor.map((r) => ({ name: r.display_name, birthYear: r.birth_year })));
  const photoOf = new Map(photoFor.map((r) => [r.athlete_id, photoMap.get(`${r.display_name}|${r.birth_year ?? 0}`) ?? null]));
  return (
    <>
      <PodiumAndClimbersView podium={podium} climbers={climbers} photoOf={photoOf} view={view} gender={gender} athleteSlugs={athleteSlugs} page={page} />
      <PhotoCreditsToast
        items={photoFor.flatMap((r) => {
          const ph = photoOf.get(r.athlete_id);
          return ph ? [{ who: r.display_name, credit: photoCredit(ph), url: ph.sourceUrl }] : [];
        })}
      />
    </>
  );
}

// Shared between the real (photos loaded) and Suspense fallback (no
// photos yet -- PodiumCard/climber cards already render GenericAthlete
// when a photo is missing, so the fallback is just this called with an
// empty photo map) renders.
function PodiumAndClimbersView({
  podium,
  climbers,
  photoOf,
  view,
  gender,
  athleteSlugs,
  page,
}: {
  podium: IndividualRankingRow[];
  climbers: IndividualRankingRow[];
  photoOf: Map<string, AthletePhoto | null>;
  view: RankingView;
  gender: string;
  athleteSlugs: Map<string, string>;
  page: number;
}) {
  return (
    <>
      {/* Podium: 2 - 1 - 3 */}
      {podium.length === 3 && page === 1 && (
        <section className="grid grid-cols-3 gap-3 sm:gap-5 items-end max-w-2xl mx-auto mb-8">
          {[
            { r: podium[1], pos: 2 },
            { r: podium[0], pos: 1 },
            { r: podium[2], pos: 3 },
          ].map(({ r, pos }) => (
            <PodiumCard key={r.athlete_id} r={r} pos={pos} photo={photoOf.get(r.athlete_id) ?? null} view={view} gender={gender} athleteSlugs={athleteSlugs} />
          ))}
        </section>
      )}

      {/* Biggest climbers */}
      {climbers.length > 0 && page === 1 && (
        <section className="mb-8">
          <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-3">Biggest climbers · last 2 weeks</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {climbers.map((r) => {
              const ph = photoOf.get(r.athlete_id);
              return (
                <Link
                  key={r.athlete_id}
                  href={athleteHref(r.athlete_id, athleteSlugs)}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 hover:bg-neutral-800"
                >
                  <span className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                    {ph ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ph.url} alt={r.display_name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <GenericAthlete name={r.display_name} gender={gender} nationality={r.nationality} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{r.display_name}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="text-green-400 font-semibold">▲{r.prev_rank! - r.rank}</span>
                      <span className="text-neutral-500">
                        #{r.prev_rank} → #{r.rank}
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

// pos = place within the (possibly filtered) list, not the world rank
function PodiumCard({ r, pos, photo, view, gender, athleteSlugs }: { r: IndividualRankingRow; pos: number; photo: AthletePhoto | null; view: RankingView; gender: string; athleteSlugs: Map<string, string> }) {
  const tall = pos === 1;
  const medal = ["🥇", "🥈", "🥉"][pos - 1];
  const ring = pos === 1 ? "border-yellow-400/60" : pos === 2 ? "border-neutral-300/50" : "border-orange-600/60";
  return (
    <Link
      href={athleteHref(r.athlete_id, athleteSlugs)}
      className={`group flex flex-col rounded-xl border ${ring} bg-neutral-900/60 overflow-hidden hover:bg-neutral-800`}
    >
      <span className={`relative w-full ${tall ? "aspect-[3/4]" : "aspect-[4/5]"} bg-neutral-800`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={r.display_name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <GenericAthlete name={r.display_name} gender={gender} nationality={r.nationality} />
        )}
        <span className="absolute top-1.5 left-1.5 text-xl sm:text-2xl drop-shadow">{medal}</span>
      </span>
      <span className="px-2 py-2 text-center">
        <span className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold leading-tight">
          <Flag code={r.nationality} />
          <span className="truncate">{r.display_name}</span>
        </span>
        <span className="block text-[11px] text-neutral-500 truncate">{r.main_event ? eventLabel(r.main_event) : ""}</span>
        <span className="block font-mono text-orange-400 text-base sm:text-lg font-bold mt-0.5">
          {view === "wins" ? `${r.wins} wins` : r.points}
        </span>
      </span>
    </Link>
  );
}

function RankingLine({
  r,
  movement,
  discipline = false,
  markFirst = false,
  athleteSlugs,
}: {
  r: IndividualRankingRow;
  movement: boolean;
  discipline?: boolean;
  markFirst?: boolean;
  athleteSlugs: Map<string, string>;
}) {
  const diff = r.prev_rank === null ? null : r.prev_rank - r.rank;
  return (
    <Link
      href={athleteHref(r.athlete_id, athleteSlugs)}
      className={`grid ${cols(movement)} gap-x-1 sm:gap-x-2 items-center px-3 py-2 text-sm ${r.rank <= 3 ? "bg-orange-500/5" : "bg-neutral-950"} hover:bg-neutral-800`}
    >
      <span className={`tabular-nums ${r.rank <= 3 ? "text-orange-400 font-bold" : "text-neutral-300"}`}>{r.rank}</span>
      {movement && <span className="text-xs text-neutral-500 tabular-nums">{r.prev_rank ?? "—"}</span>}
      {movement && (
        <span className="text-xs tabular-nums">
          {diff === null ? (
            <span className="text-sky-400" title="New in the ranking">new</span>
          ) : diff > 0 ? (
            <span className="text-green-400">▲{diff}</span>
          ) : diff < 0 ? (
            <span className="text-red-400">▼{-diff}</span>
          ) : (
            <span className="text-neutral-600">–</span>
          )}
        </span>
      )}
      <span className="flex items-center gap-2 min-w-0">
        <Flag code={r.nationality} />
        <span className="truncate">{r.display_name}</span>
      </span>
      <span className={`hidden sm:block text-xs truncate ${discipline ? "font-mono text-neutral-300" : "text-neutral-500"}`}>
        {discipline ? r.best_mark ?? "" : r.main_event ? eventLabel(r.main_event) : ""}
      </span>
      <span className="hidden sm:block text-right text-xs text-neutral-400 tabular-nums">{r.wins || ""}</span>
      {/* phones: the chosen metric; desktop: points (mark has its own column) */}
      <span className="text-right font-mono text-orange-400 tabular-nums">
        {markFirst ? (
          <>
            <span className="sm:hidden">{r.best_mark ?? "—"}</span>
            <span className="hidden sm:inline text-neutral-300">{r.points}</span>
          </>
        ) : (
          r.points
        )}
      </span>
    </Link>
  );
}

// Nations, as complete as the athletes' views: podium of flags, biggest
// climbers, Prev/Diff table. Same 24-best-athletes rule as Countries.
async function NationsRanking({ view, sp }: { view: NationView; sp: SP }) {
  const years = await getCountryYears();
  const currentYear = new Date().getFullYear();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const gender = sp.gender === "Women" ? "Women" : "Men";
  const age = AGES.includes((sp.age ?? "") as (typeof AGES)[number]) ? sp.age || undefined : undefined;
  const type = rankingType(sp.type);
  const allEventOptions: string[] = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events[gender]])));
  const eventOptions = allEventOptions.filter((ev) => !type || eventMatchesType(ev, type));
  const event = sp.event && eventOptions.includes(sp.event) ? sp.event : undefined;
  const area = sp.area && sp.area in AREAS ? sp.area : undefined;
  const [rows, progression] = await Promise.all([
    getNationRanking({ view, gender, year, age, event, area }),
    event ? getEventYearlyProgression(event, gender, age) : Promise.resolve([]),
  ]);
  const movement = view === "rolling" || year === currentYear;
  const podium = rows.slice(0, 3);
  const climbers = movement
    ? rows
        .filter((r) => r.prev_rank !== null && r.prev_rank - r.rank >= 1)
        .sort((a, b) => b.prev_rank! - b.rank - (a.prev_rank! - a.rank))
        .slice(0, 4)
    : [];
  const href = (over: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { view: `n-${view}`, gender, year: String(year), age: age ?? "", event: event ?? "", area: area ?? "", type: type ?? "", ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, String(v));
    return `/rankings?${q.toString()}`;
  };
  const countryHref = (code: string) => `/countries/${code}?year=${year}&gender=${gender}${age ? `&age=${age}` : ""}`;
  const selectClass = "shrink-0 bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";
  const maxPoints = Math.max(1, ...rows.map((r) => r.points));
  const cols = movement
    ? "grid-cols-[2.5rem_2.5rem_2.75rem_minmax(0,1fr)_4rem] sm:grid-cols-[2.5rem_2.5rem_2.75rem_minmax(0,1fr)_minmax(0,0.8fr)_3.5rem_4rem]"
    : "grid-cols-[2.5rem_minmax(0,1fr)_4rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,0.8fr)_3.5rem_4rem]";

  return (
    <>

      <div className="flex flex-col gap-2 mb-4 bg-neutral-950 border border-neutral-800 rounded-lg p-2 sm:p-3">
        <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
          <div className="shrink-0 flex rounded bg-neutral-800 p-0.5 text-xs">
            {(["Men", "Women"] as const).map((g) => (
              <Link key={g} href={href({ gender: g, event: "" })} className={`px-3 py-1.5 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}>
                {g}
              </Link>
            ))}
          </div>
          {view !== "rolling" && (
            <LinkSelect
              value={String(year)}
              className={selectClass}
              options={years.map((y) => ({ value: String(y), label: String(y), href: href({ year: String(y) }) }))}
            />
          )}
        </div>
        <div className="pill-row flex flex-nowrap overflow-x-auto items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0">
          <LinkSelect
            value={type ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All types", href: href({ type: "", event: "" }) },
              ...RANKING_TYPES.map((o) => ({ value: o.value, label: o.label, href: href({ type: o.value, event: allEventOptions.find((ev) => eventMatchesType(ev, o.value)) ?? "" }) })),
            ]}
          />
          <LinkSelect
            value={event ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All disciplines", href: href({ event: "" }) },
              ...sortEventsAlpha(eventOptions).map((e) => ({ value: e, label: eventLabel(e), href: href({ event: e }) })),
            ]}
          />
          <LinkSelect
            value={area ?? ""}
            className={selectClass}
            options={[
              { value: "", label: "All areas", href: href({ area: "" }) },
              ...Object.entries(AREAS).map(([k, v]) => ({ value: k, label: v, href: href({ area: k }) })),
            ]}
          />
          <LinkSelect
            value={age ?? ""}
            className={selectClass}
            options={AGES.map((a) => ({ value: a, label: a || "All ages", href: href({ age: a }) }))}
          />
        </div>
      </div>

      {/* podium of flags: 2 - 1 - 3 */}
      {podium.length === 3 && (
        <section className="grid grid-cols-3 gap-3 sm:gap-5 items-end max-w-2xl mx-auto mb-8">
          {[
            { r: podium[1], pos: 2 },
            { r: podium[0], pos: 1 },
            { r: podium[2], pos: 3 },
          ].map(({ r, pos }) => {
            const ring = pos === 1 ? "border-yellow-400/60" : pos === 2 ? "border-neutral-300/50" : "border-orange-600/60";
            const src = flagUrlWide(r.code, 320);
            return (
              <Link key={r.code} href={countryHref(r.code)} className={`flex flex-col rounded-xl border ${ring} bg-neutral-900/60 overflow-hidden hover:bg-neutral-800`}>
                <span className={`relative w-full ${pos === 1 ? "aspect-[4/3]" : "aspect-[3/2]"} bg-neutral-800`}>
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={r.name} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  <span className="absolute top-1.5 left-1.5 text-xl sm:text-2xl drop-shadow">{["🥇", "🥈", "🥉"][pos - 1]}</span>
                </span>
                <span className="px-2 py-2 text-center">
                  <span className="block text-xs sm:text-sm font-semibold truncate">{r.name}</span>
                  <span className="block font-mono text-orange-400 text-base sm:text-lg font-bold">
                    {view === "wins" ? `${r.wins} wins` : r.points}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      )}

      {climbers.length > 0 && (
        <section className="mb-8">
          <h2 className="bg-tint text-neutral-100 text-[13px] font-extrabold uppercase tracking-wide px-3 sm:px-4 py-2 rounded-lg mb-3">Biggest climbers · last 2 weeks</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {climbers.map((r) => (
              <Link key={r.code} href={countryHref(r.code)} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 hover:bg-neutral-800">
                <Flag code={r.code} className="w-8 h-6" />
                <span className="min-w-0">
                  <span className="block text-sm truncate">{r.name}</span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="text-green-400 font-semibold">▲{r.prev_rank! - r.rank}</span>
                    <span className="text-neutral-500">
                      #{r.prev_rank} → #{r.rank}
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ViewAllList
        noun="nations"
        initial={20}
        scrollOnMobile
        header={
        <div className={`grid ${cols} gap-x-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500`}>
          <span>#</span>
          {movement && <span>Prev</span>}
          {movement && <span>Diff</span>}
          <span>Nation</span>
          <span className="hidden sm:block" />
          <span className="hidden sm:block text-right">Wins</span>
          <span className="text-right">Points</span>
        </div>
        }
        items={rows.slice(0, 200).map((r) => {
            const t = tierForRank(r.rank);
            const diff = r.prev_rank === null ? null : r.prev_rank - r.rank;
            return (
              <Link key={r.code} href={countryHref(r.code)} className={`grid ${cols} gap-x-2 items-center px-3 py-2 text-sm bg-neutral-950 hover:bg-neutral-800`}>
                <span className={`tabular-nums font-semibold ${t ? t.color : "text-neutral-400"}`}>{r.rank}</span>
                {movement && <span className="text-xs text-neutral-500 tabular-nums">{r.prev_rank ?? "—"}</span>}
                {movement && (
                  <span className="text-xs tabular-nums">
                    {diff === null ? (
                      <span className="text-sky-400">new</span>
                    ) : diff > 0 ? (
                      <span className="text-green-400">▲{diff}</span>
                    ) : diff < 0 ? (
                      <span className="text-red-400">▼{-diff}</span>
                    ) : (
                      <span className="text-neutral-600">–</span>
                    )}
                  </span>
                )}
                <span className="flex items-center gap-2 min-w-0">
                  <Flag code={r.code} />
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="hidden sm:flex items-center">
                  <span className="h-2 rounded-sm bg-orange-500/70" style={{ width: `${Math.max(2, (r.points / maxPoints) * 100)}%` }} />
                </span>
                <span className="hidden sm:block text-right text-xs text-neutral-400 tabular-nums">{r.wins}</span>
                <span className="text-right font-mono text-orange-400 tabular-nums">{r.points}</span>
              </Link>
            );
          })}
      />
      {rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No nations for this selection.</div>}
      {event && progression.length >= 2 && (
        <div className="mt-8">
          <ProgressionBox event={event} data={progression} />
        </div>
      )}
    </>
  );
}

// Best mark of every year for the selected event (both discipline views).
async function ProgressionBox({ event, data }: { event: string; data: Awaited<ReturnType<typeof getEventYearlyProgression>> }) {
  const field = isFieldEvent(event);
  const best = data.reduce<(typeof data)[number] | null>(
    (b, d) => (!b || (field ? d.mark_value > b.mark_value : d.mark_value < b.mark_value) ? d : b),
    null
  );
  const photo = best?.athlete ? await getAthletePhotoInfo(best.athlete) : null;
  return (
    <section className="mb-8 border border-neutral-800 rounded-lg p-3 bg-neutral-950">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">{eventLabel(event)} · best mark by year</div>
      <YearlyProgressionChart data={data} isField={field} recordPhoto={photo ? { url: photo.url, credit: photoCredit(photo) } : null} />
    </section>
  );
}
