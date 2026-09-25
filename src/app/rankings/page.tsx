import { Suspense } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import RankingsExplorer from "@/components/RankingsExplorer";
import PhotoCreditsToast from "@/components/PhotoCreditsToast";
import { eventLabel } from "@/lib/events";
import { getAthletePhotoInfo, photoCredit, type AthletePhoto } from "@/lib/wikipedia";
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

const MENU: { title: string; items: { label: string; view?: string; href?: string; help: string }[] }[] = [
  {
    title: "Ranking",
    items: [
      { label: "Season", view: "season", help: "Points scored in the selected season" },
      { label: "Rolling 12 months", view: "rolling", help: "Points over the last 365 days" },
      { label: "Wins", view: "wins", help: "Most wins, points as tie-break" },
    ],
  },
  {
    title: "More",
    items: [
      { label: "By discipline", view: "discipline", help: "Per event: points or marks, wind, indoor, relays" },
      { label: "Nations", href: "/countries", help: "Countries by their 24 best athletes" },
    ],
  },
];

type SP = { view?: string; gender?: string; year?: string; nationality?: string; age?: string; page?: string; event?: string };

// Same columns for the table header and every row.
function cols(movement: boolean) {
  return movement
    ? "grid-cols-[2.5rem_2.5rem_2.75rem_minmax(0,1fr)_4rem] sm:grid-cols-[2.5rem_2.5rem_2.75rem_minmax(0,1fr)_9rem_3rem_4rem]"
    : "grid-cols-[2.5rem_minmax(0,1fr)_4rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_9rem_3rem_4rem]";
}

export default async function RankingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // links across the site (/rankings?event=...) mean the per-discipline explorer
  const view = (["season", "rolling", "wins", "discipline"].includes(sp.view ?? "") ? sp.view : sp.event ? "discipline" : "season") as
    | RankingView
    | "discipline";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_14rem] gap-8 items-start">
          <div className="min-w-0">
            {view === "discipline" ? (
              <>
                <h1 className="text-2xl font-bold mb-6">
                  Ranking <span className="text-orange-500">» By discipline</span>
                </h1>
                <Suspense fallback={<div className="text-sm text-neutral-500">Loading…</div>}>
                  <RankingsExplorer />
                </Suspense>
              </>
            ) : (
              <IndividualRanking view={view} sp={sp} />
            )}
          </div>
          <SideMenu view={view} />
        </div>
      </main>
    </div>
  );
}

function SideMenu({ view }: { view: string }) {
  return (
    <aside className="min-w-0 flex lg:flex-col gap-4 lg:gap-6 order-first lg:order-none overflow-x-auto pill-row">
      {MENU.map((m) => (
        <section key={m.title} className="shrink-0">
          <h2 className="hidden lg:block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-2 px-2">{m.title}</h2>
          <ul className="flex lg:flex-col gap-1">
            {m.items.map((it) => {
              const active = it.view === view;
              return (
                <li key={it.label}>
                  <Link
                    href={it.href ?? `/rankings?view=${it.view}`}
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
  );
}

async function IndividualRanking({ view, sp }: { view: RankingView; sp: SP }) {
  const years = await getRankingYears();
  const currentYear = new Date().getFullYear();
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const gender = sp.gender === "Women" ? "Women" : "Men";
  const age = AGES.includes((sp.age ?? "") as (typeof AGES)[number]) ? sp.age || undefined : undefined;
  const nationality = sp.nationality || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const movement = hasMovement(view, year, currentYear);

  const nationalities = await getRankingNationalities(gender);
  const nationalityCodes = nationality ? nationalities.find((n) => n.code === nationality)?.codes ?? [nationality] : undefined;
  const params = { view, gender, year, nationality, nationalityCodes, age } as const;
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

  const photoFor = [...podium, ...climbers];
  const photos: (AthletePhoto | null)[] = [];
  for (let i = 0; i < photoFor.length; i += 3) {
    photos.push(...(await Promise.all(photoFor.slice(i, i + 3).map((r) => getAthletePhotoInfo(r.display_name, r.birth_year)))));
  }
  const photoOf = new Map(photoFor.map((r, i) => [r.athlete_id, photos[i]]));

  const href = (over: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { view, gender, year: String(year), nationality: nationality ?? "", age: age ?? "", page: "1", ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, String(v));
    return `/rankings?${q.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const title = view === "rolling" ? "Rolling 12 months" : view === "wins" ? `Wins ${year}` : `Season ${year}`;
  const selectClass = "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";

  return (
    <>
      <h1 className="text-2xl font-bold mb-1">
        Ranking <span className="text-orange-500">» {title}</span>
      </h1>
      <p className="text-sm text-neutral-500 mb-4">
        {view === "rolling"
          ? "Sum of points over the last 365 days."
          : view === "wins"
          ? "Wins in the season, points as tie-break."
          : "Sum of points scored in the season."}{" "}
        {movement && "Up/down arrows compare with the ranking two weeks ago."}
      </p>

      {/* Filters */}
      <form action="/rankings" className="flex flex-wrap items-center gap-2 mb-6">
        <input type="hidden" name="view" value={view} />
        <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
          {(["Men", "Women"] as const).map((g) => (
            <Link
              key={g}
              href={href({ gender: g, nationality: "" })}
              className={`px-2.5 py-1 rounded ${gender === g ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {g}
            </Link>
          ))}
        </div>
        <input type="hidden" name="gender" value={gender} />
        {view !== "rolling" && (
          <select name="year" defaultValue={year} className={selectClass}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <select name="nationality" defaultValue={nationality ?? ""} className={`${selectClass} max-w-[11rem]`}>
          <option value="">All nations</option>
          {nationalities.map((n) => (
            <option key={n.code} value={n.code}>
              {n.name}
            </option>
          ))}
        </select>
        <select name="age" defaultValue={age ?? ""} className={selectClass}>
          {AGES.map((a) => (
            <option key={a || "all"} value={a}>
              {a || "All ages"}
            </option>
          ))}
        </select>
        <button className="text-xs px-3 py-1.5 rounded bg-orange-500 text-black font-semibold">Filter</button>
        {(nationality || age) && (
          <Link href={href({ nationality: "", age: "" })} className="text-xs text-neutral-500 hover:text-neutral-300">
            clear
          </Link>
        )}
      </form>

      {/* Podium: 2 - 1 - 3 */}
      {podium.length === 3 && page === 1 && (
        <section className="grid grid-cols-3 gap-3 sm:gap-5 items-end max-w-2xl mx-auto mb-8">
          {[
            { r: podium[1], pos: 2 },
            { r: podium[0], pos: 1 },
            { r: podium[2], pos: 3 },
          ].map(({ r, pos }) => (
            <PodiumCard key={r.athlete_id} r={r} pos={pos} photo={photoOf.get(r.athlete_id) ?? null} view={view} />
          ))}
        </section>
      )}

      {/* Biggest climbers */}
      {climbers.length > 0 && page === 1 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Biggest climbers · last 2 weeks</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {climbers.map((r) => {
              const ph = photoOf.get(r.athlete_id);
              return (
                <Link
                  key={r.athlete_id}
                  href={`/athletes/${r.athlete_id}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5 hover:bg-neutral-800"
                >
                  <span className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center text-sm font-bold text-neutral-500">
                    {ph ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ph.url} alt={r.display_name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      r.display_name.charAt(0)
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

      {/* Table */}
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <div className={`grid ${cols(movement)} gap-x-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800`}>
          <span>#</span>
          {movement && <span>Prev</span>}
          {movement && <span>Diff</span>}
          <span>Athlete</span>
          <span className="hidden sm:block">Main event</span>
          <span className="hidden sm:block text-right">Wins</span>
          <span className="text-right">Points</span>
        </div>
        <div className="divide-y divide-neutral-800">
          {rows.map((r) => (
            <RankingLine key={r.athlete_id} r={r} movement={movement} />
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

      <PhotoCreditsToast
        items={photoFor.flatMap((r) => {
          const ph = photoOf.get(r.athlete_id);
          return ph ? [{ who: r.display_name, credit: photoCredit(ph), url: ph.sourceUrl }] : [];
        })}
      />
    </>
  );
}

// pos = place within the (possibly filtered) list, not the world rank
function PodiumCard({ r, pos, photo, view }: { r: IndividualRankingRow; pos: number; photo: AthletePhoto | null; view: RankingView }) {
  const tall = pos === 1;
  const medal = ["🥇", "🥈", "🥉"][pos - 1];
  const ring = pos === 1 ? "border-yellow-400/60" : pos === 2 ? "border-neutral-300/50" : "border-orange-600/60";
  return (
    <Link
      href={`/athletes/${r.athlete_id}`}
      className={`group flex flex-col rounded-xl border ${ring} bg-neutral-900/60 overflow-hidden hover:bg-neutral-800`}
    >
      <span className={`relative w-full ${tall ? "aspect-[3/4]" : "aspect-[4/5]"} bg-neutral-800 flex items-center justify-center text-4xl font-bold text-neutral-600`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={r.display_name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          r.display_name.charAt(0)
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

function RankingLine({ r, movement }: { r: IndividualRankingRow; movement: boolean }) {
  const diff = r.prev_rank === null ? null : r.prev_rank - r.rank;
  return (
    <Link
      href={`/athletes/${r.athlete_id}`}
      className={`grid ${cols(movement)} gap-x-2 items-center px-3 py-2 text-sm ${r.rank <= 3 ? "bg-orange-500/5" : "bg-neutral-900/40"} hover:bg-neutral-800`}
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
      <span className="hidden sm:block text-xs text-neutral-500 truncate">{r.main_event ? eventLabel(r.main_event) : ""}</span>
      <span className="hidden sm:block text-right text-xs text-neutral-400 tabular-nums">{r.wins || ""}</span>
      <span className="text-right font-mono text-orange-400 tabular-nums">{r.points}</span>
    </Link>
  );
}
