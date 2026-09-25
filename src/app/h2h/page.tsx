import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import H2HPicker from "@/components/H2HPicker";
import { getAthleteInfo, getAthletePersonalBests } from "@/lib/queries";
import { getAthletePhotoInfo, photoCredit, type AthletePhoto } from "@/lib/wikipedia";
import PhotoCreditsToast from "@/components/PhotoCreditsToast";
import { eventLabel, TIER_LABELS } from "@/lib/events";
import { getH2H, getH2HSuggestions, type H2HKpis, type H2HSeasonPoint } from "@/lib/h2h";

export const revalidate = 3600;

// Head-to-head (after ProCyclingStats' H2H). With only ?a= it's the rival
// picker: search box + the athletes this one raced most. With ?a=&b= it's
// the duel: share of races won against each other, key info, career KPIs
// as mirrored bars, personal bests in common, points by age, and every
// race they shared.

const COLOR_A = "#f97316"; // orange-500
const COLOR_B = "#38bdf8"; // sky-400

export default async function H2HPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  if (!a) notFound();
  const infoA = await getAthleteInfo(a);
  if (!infoA) notFound();

  if (!b) {
    const suggestions = await getH2HSuggestions(a);
    return (
      <Shell>
        <AthleteTitle id={a} name={infoA.display_name} nationality={infoA.nationality} />
        <h2 className="text-lg font-semibold mt-4 mb-1">Head-to-head</h2>
        <p className="text-sm text-neutral-400 mb-3">Pick an athlete to compare results and careers.</p>
        <H2HPicker baseId={a} />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mt-8 mb-2">Most frequent rivals</h3>
        <div className="max-w-xl border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_4rem_5rem] gap-x-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
            <span>#</span>
            <span>Athlete</span>
            <span className="text-right">Races</span>
            <span className="text-right">Ahead</span>
          </div>
          {suggestions.map((s, i) => (
            <Link
              key={s.athlete_id}
              href={`/h2h?a=${a}&b=${s.athlete_id}`}
              className="grid grid-cols-[2rem_1fr_4rem_5rem] gap-x-2 items-center px-3 py-1.5 text-sm bg-neutral-900/40 hover:bg-neutral-800"
            >
              <span className="text-xs text-neutral-500">{i + 1}</span>
              <span className="flex items-center gap-2 min-w-0">
                <Flag code={s.nationality} />
                <span className="truncate">{s.display_name}</span>
              </span>
              <span className="text-right tabular-nums text-neutral-300">{s.n_shared}</span>
              <span className="text-right tabular-nums text-xs text-neutral-400" title={`${infoA.display_name} finished ahead`}>
                {s.ahead}–{s.n_shared - s.ahead}
              </span>
            </Link>
          ))}
          {suggestions.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No shared races found.</div>}
        </div>
      </Shell>
    );
  }

  const infoB = await getAthleteInfo(b);
  if (!infoB) notFound();
  const [{ shared, kpis, seasons }, photoA, photoB, pbA, pbB] = await Promise.all([
    getH2H(a, b),
    getAthletePhotoInfo(infoA.display_name, infoA.birth_year),
    getAthletePhotoInfo(infoB.display_name, infoB.birth_year),
    getAthletePersonalBests(a),
    getAthletePersonalBests(b),
  ]);
  const kA = kpis.find((k) => k.athlete_id === a);
  const kB = kpis.find((k) => k.athlete_id === b);
  const aheadA = shared.filter((r) => r.place_a < r.place_b).length;
  const aheadB = shared.filter((r) => r.place_b < r.place_a).length;
  const decided = aheadA + aheadB;
  const pctA = decided ? Math.round((aheadA / decided) * 1000) / 10 : null;
  const pctB = pctA === null ? null : Math.round((100 - pctA) * 10) / 10;

  // personal bests in common, better one = lower all-time rank
  const pbMapB = new Map(pbB.map((p) => [p.athletics_event, p]));
  const commonPbs = pbA
    .filter((p) => pbMapB.has(p.athletics_event))
    .map((p) => ({ event: p.athletics_event, a: p, b: pbMapB.get(p.athletics_event)! }));

  const thisYear = new Date().getFullYear();
  const age = (k?: H2HKpis) => (k?.birth_year ? thisYear - k.birth_year : null);

  const kpiRows: { label: string; a: number; b: number; fmt?: (n: number) => string }[] = [
    { label: "Wins", a: kA?.wins ?? 0, b: kB?.wins ?? 0 },
    { label: "Podiums", a: kA?.podiums ?? 0, b: kB?.podiums ?? 0 },
    { label: "Olympic + World medals", a: kA?.ow_medals ?? 0, b: kB?.ow_medals ?? 0 },
    { label: "Career points", a: kA?.points ?? 0, b: kB?.points ?? 0 },
    { label: "Best season (points)", a: kA?.best_season_points ?? 0, b: kB?.best_season_points ?? 0 },
    { label: "Points per result", a: kA && kA.results ? kA.points / kA.results : 0, b: kB && kB.results ? kB.points / kB.results : 0, fmt: (n) => n.toFixed(1) },
    { label: "Results", a: kA?.results ?? 0, b: kB?.results ?? 0 },
    { label: "Seasons", a: kA?.seasons ?? 0, b: kB?.seasons ?? 0 },
  ];

  return (
    <Shell>
      <p className="text-sm text-neutral-400 mb-4">
        <Link href={`/athletes/${a}`} className="text-orange-400 hover:underline">{infoA.display_name}</Link> vs{" "}
        <Link href={`/athletes/${b}`} className="text-sky-400 hover:underline">{infoB.display_name}</Link> ·{" "}
        <Link href={`/h2h?a=${b}&b=${a}`} className="hover:text-neutral-200 underline">swap</Link> ·{" "}
        <Link href={`/h2h?a=${a}`} className="hover:text-neutral-200 underline">change rival</Link>
      </p>

      {/* Duel header */}
      <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-8 max-w-3xl mx-auto">
        <DuelSide name={infoA.display_name} id={a} nationality={infoA.nationality} photo={photoA} pct={pctA} color="text-orange-400" align="end" />
        <div className="text-center">
          <div className="text-3xl font-black text-neutral-500">VS</div>
          <div className="text-xs text-neutral-500 mt-1">
            {shared.length} shared race{shared.length === 1 ? "" : "s"}
            <br />
            {aheadA}–{aheadB}
          </div>
        </div>
        <DuelSide name={infoB.display_name} id={b} nationality={infoB.nationality} photo={photoB} pct={pctB} color="text-sky-400" align="start" />
      </section>

      {/* one centred column, every block the same width */}
      <PhotoCreditsToast
        items={[
          ...(photoA ? [{ who: infoA.display_name, credit: photoCredit(photoA), url: photoA.sourceUrl }] : []),
          ...(photoB ? [{ who: infoB.display_name, credit: photoCredit(photoB), url: photoB.sourceUrl }] : []),
        ]}
      />
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
      {/* Key info */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">Key info</h2>
        <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden text-sm">
          {[
            { label: "Age", a: age(kA) ?? "—", b: age(kB) ?? "—" },
            { label: "Nation", a: <><Flag code={kA?.nationality} className="mr-1" />{kA?.nationality ?? "—"}</>, b: <><Flag code={kB?.nationality} className="mr-1" />{kB?.nationality ?? "—"}</> },
            { label: "First season", a: kA?.first_year ?? "—", b: kB?.first_year ?? "—" },
            { label: "Last season", a: kA?.last_year ?? "—", b: kB?.last_year ?? "—" },
            { label: "Disciplines", a: kA?.events ?? "—", b: kB?.events ?? "—" },
          ].map((r) => (
            <div key={r.label} className="grid grid-cols-[1fr_8rem_1fr] px-3 py-1.5 bg-neutral-900/40">
              <span className="text-right">{r.a}</span>
              <span className="text-center text-xs text-neutral-500 self-center">{r.label}</span>
              <span>{r.b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Personal bests in common */}
      {commonPbs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">Personal bests</h2>
          <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden text-sm">
            {commonPbs.map(({ event, a: pa, b: pb }) => {
              const aBetter = (pa.all_time_rank ?? 1e9) < (pb.all_time_rank ?? 1e9);
              return (
                <div key={event} className="grid grid-cols-[1fr_8rem_1fr] px-3 py-1.5 bg-neutral-900/40">
                  <span className={`text-right font-mono ${aBetter ? "text-orange-400 font-semibold" : "text-neutral-400"}`}>
                    {pa.mark_display} <span className="text-[10px] text-neutral-500">({pa.year})</span>
                  </span>
                  <span className="text-center text-xs text-neutral-500 self-center">{eventLabel(event)}</span>
                  <span className={`font-mono ${!aBetter ? "text-sky-400 font-semibold" : "text-neutral-400"}`}>
                    {pb.mark_display} <span className="text-[10px] text-neutral-500">({pb.year})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Career KPIs: mirrored bars */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">Career key performance indicators</h2>
        <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden text-sm">
          {kpiRows.map((r) => {
            const max = Math.max(r.a, r.b, 1e-9);
            const f = r.fmt ?? ((n: number) => String(Math.round(n)));
            return (
              <div key={r.label} className="grid grid-cols-[3.5rem_1fr_9rem_1fr_3.5rem] items-center gap-x-2 px-3 py-1.5 bg-neutral-900/40">
                <span className={`text-right tabular-nums ${r.a >= r.b ? "font-semibold" : "text-neutral-400"}`}>{f(r.a)}</span>
                <span className="h-2.5 rounded-sm bg-neutral-800 flex justify-end overflow-hidden">
                  <span className="h-full rounded-sm" style={{ width: `${(r.a / max) * 100}%`, background: COLOR_A }} />
                </span>
                <span className="text-center text-[11px] text-neutral-500">{r.label}</span>
                <span className="h-2.5 rounded-sm bg-neutral-800 overflow-hidden">
                  <span className="block h-full rounded-sm" style={{ width: `${(r.b / max) * 100}%`, background: COLOR_B }} />
                </span>
                <span className={`tabular-nums ${r.b >= r.a ? "font-semibold" : "text-neutral-400"}`}>{f(r.b)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Points per age */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">Points per age</h2>
        <PointsChart seasons={seasons} a={a} b={b} nameA={infoA.display_name} nameB={infoB.display_name} />
      </section>

      {/* Shared races */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">Same race results</h2>
        {shared.length === 0 ? (
          <p className="text-sm text-neutral-500">They never raced each other.</p>
        ) : (
          <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden max-h-[40rem] overflow-y-auto">
            {shared.map((r, i) => (
              <div key={i} className="grid grid-cols-[4.5rem_1fr_2.5rem_2.5rem] items-center gap-x-2 px-3 py-1.5 text-sm bg-neutral-900/40">
                <span className="text-xs text-neutral-500 tabular-nums">{r.date}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Link
                      href={`/meets/${encodeURIComponent(r.event_name)}?year=${r.year}&discipline=${encodeURIComponent(r.athletics_event)}`}
                      className="truncate hover:text-orange-400"
                    >
                      {r.event_name}
                    </Link>
                    {r.tier && (
                      <span
                        title={TIER_LABELS.find((t) => t.value === r.tier)?.label ?? r.tier}
                        className="text-[10px] font-mono px-1 rounded bg-neutral-800 text-orange-400 shrink-0"
                      >
                        {r.tier}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-neutral-500 truncate">
                    {eventLabel(r.athletics_event)}
                    {r.round ? ` · ${r.round}` : ""} · <span className="font-mono">{r.mark_a}</span> vs{" "}
                    <span className="font-mono">{r.mark_b}</span>
                  </span>
                </span>
                <span className={`text-right tabular-nums ${r.place_a < r.place_b ? "text-orange-400 font-semibold" : "text-neutral-500"}`}>
                  {r.place_a}
                </span>
                <span className={`text-right tabular-nums ${r.place_b < r.place_a ? "text-sky-400 font-semibold" : "text-neutral-500"}`}>
                  {r.place_b}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">{children}</main>
    </div>
  );
}

function AthleteTitle({ id, name, nationality }: { id: string; name: string; nationality: string | null }) {
  return (
    <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
      <Flag code={nationality} className="w-7 h-5" />
      <Link href={`/athletes/${id}`} className="hover:text-orange-400">
        {name}
      </Link>
    </h1>
  );
}

function DuelSide({
  name,
  id,
  nationality,
  photo,
  pct,
  color,
  align,
}: {
  name: string;
  id: string;
  nationality: string | null;
  photo: AthletePhoto | null;
  pct: number | null;
  color: string;
  align: "start" | "end";
}) {
  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "items-end text-right" : "items-start text-left"}`}>
      <Link href={`/athletes/${id}`} className="text-lg sm:text-2xl font-bold hover:underline flex items-center gap-2">
        {align === "start" && <Flag code={nationality} />}
        {name}
        {align === "end" && <Flag code={nationality} />}
      </Link>
      <span className={`text-3xl sm:text-4xl font-black ${color}`} title="Share of shared races finishing ahead">
        {pct === null ? "—" : `${pct}%`}
      </span>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" title={photoCredit(photo)}>
          <img src={photo.url} alt={name} className="w-24 h-28 sm:w-28 sm:h-32 object-cover rounded-md border border-neutral-800" />
        </a>
      ) : (
        <span className="w-24 h-28 sm:w-28 sm:h-32 rounded-md bg-neutral-800 flex items-center justify-center text-3xl font-bold text-neutral-500">
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}

// Two-line SVG chart of season points by age (by year when an athlete has
// no birth year).
function PointsChart({ seasons, a, b, nameA, nameB }: { seasons: H2HSeasonPoint[]; a: string; b: string; nameA: string; nameB: string }) {
  const useAge = seasons.every((s) => s.age !== null);
  const x = (s: H2HSeasonPoint) => (useAge ? s.age! : s.year);
  if (seasons.length === 0) return <p className="text-sm text-neutral-500">No points yet.</p>;
  const xs = seasons.map(x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs, minX + 1);
  const maxY = Math.max(...seasons.map((s) => s.points), 1);
  const W = 560;
  const H = 220;
  const P = { l: 40, r: 10, t: 10, b: 24 };
  const px = (v: number) => P.l + ((v - minX) / (maxX - minX)) * (W - P.l - P.r);
  const py = (v: number) => H - P.b - (v / maxY) * (H - P.t - P.b);
  const line = (id: string) =>
    seasons
      .filter((s) => s.athlete_id === id)
      .sort((p, q) => x(p) - x(q))
      .map((s) => `${px(x(s))},${py(s.points)}`)
      .join(" ");
  const ticks = [];
  for (let v = minX; v <= maxX; v++) ticks.push(v);
  return (
    <div className="border border-neutral-800 rounded-lg p-2 bg-neutral-900/40">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={py(maxY * f)} y2={py(maxY * f)} stroke="#262626" strokeDasharray="3 3" />
            <text x={P.l - 4} y={py(maxY * f) + 3} textAnchor="end" fontSize="9" fill="#737373">
              {Math.round(maxY * f)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={px(t)} y={H - 8} textAnchor="middle" fontSize="9" fill="#737373">
            {useAge ? t : `'${String(t).slice(2)}`}
          </text>
        ))}
        <polyline points={line(a)} fill="none" stroke={COLOR_A} strokeWidth="2" />
        <polyline points={line(b)} fill="none" stroke={COLOR_B} strokeWidth="2" />
      </svg>
      <div className="flex justify-center gap-4 text-xs mt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5" style={{ background: COLOR_A }} />{nameA}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5" style={{ background: COLOR_B }} />{nameB}</span>
        <span className="text-neutral-500">{useAge ? "by age" : "by season"}</span>
      </div>
    </div>
  );
}
