import Link from "next/link";
import Flag from "./Flag";
import WindBadge from "./WindBadge";
import { type MeetResultRow } from "@/lib/queries";
import { eventLabel, isRelayEvent, isFieldEvent } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

// Shared between /meets/[name] (grouped across every source spelling of
// a series) and /competitions/[name] (one exact raw event_name only,
// used to debug what a specific raw source row actually contains) --
// same results, same known data quirks, so both pages should render and
// split them identically.

export type Group = {
  athletics_event: string;
  gender: string;
  round: string | null;
  wind: string | null;
  section: number;
  rows: MeetResultRow[];
  label?: "Podium" | "Rest of times"; // set when this section came from resolving a merged heat+final -- see splitResolved
  level: number | null; // field strength of this specific race, 0-100, tier-anchored (see registry/16_compute_race_level.sql)
};

export function meetSectionAnchor(athleticsEvent: string, gender: string, round?: string | null, wind?: string | null, section?: number): string {
  const base = `${eventSlug(athleticsEvent)}-${gender.toLowerCase()}`;
  const withRound = round ? `${base}-${eventSlug(round)}` : base;
  const withWind = wind ? `${withRound}-${eventSlug(wind)}` : withRound;
  return section ? `${withWind}-${section}` : withWind;
}

// Some sources (confirmed on worldathletics -- indoor meets especially,
// which never have a wind reading at all to split by) run two parallel
// sections that share both the same round text AND no wind. Same signal
// as the backend scoring fix (compute_competition_score_v2.sql): a
// duplicate place value with two different marks means two different
// races got merged, not a real tie. Split by ranking each pair of
// same-place rows by their own mark -- not reliable rank-by-rank on the
// margins (the two fields' mid-pack times can genuinely overlap), but
// turns an obviously-broken interleaved list (two different people both
// "1st", "2nd", ...) into two coherent sections, each keeping its own
// original place numbering.
// is_shadow_result (a real quality gap, computed server-side from each
// mark's own all-time rank) is authoritative and comes first: it separates
// a genuine shadow section from the real one. Everything else stays
// together in one tier-split, even when the source's own place numbers
// collide, and within that split two athletes with the EXACT SAME mark
// (a tie) always land in the same section -- ranked by the distinct mark
// values themselves, not by each row's sort index, which used to break
// ties arbitrarily and could eject one of two tied athletes into its own
// stray section (confirmed: Athletissima Lausanne 2007 Men's 100m, Steve
// Mullings and Michael Frater both ran 10.20 and ended up split apart).
function splitByMarkTier(rows: MeetResultRow[], isField: boolean): MeetResultRow[][] {
  const byPlace = new Map<number, MeetResultRow[]>();
  const withoutPlace: MeetResultRow[] = [];
  for (const r of rows) {
    if (r.place == null) {
      withoutPlace.push(r);
      continue;
    }
    const arr = byPlace.get(r.place) ?? [];
    arr.push(r);
    byPlace.set(r.place, arr);
  }
  const needsSplit = Array.from(byPlace.values()).some(
    (arr) => arr.length > 1 && new Set(arr.map((r) => r.mark_display)).size > 1
  );
  if (!needsSplit) return [rows];

  const sections: MeetResultRow[][] = [];
  for (const arr of byPlace.values()) {
    const marks = Array.from(new Set(arr.map((r) => r.mark_display)));
    const markValue = (m: string) => arr.find((r) => r.mark_display === m)?.mark_value ?? null;
    marks.sort((ma, mb) => {
      const va = markValue(ma);
      const vb = markValue(mb);
      if (va == null) return 1;
      if (vb == null) return -1;
      return isField ? vb - va : va - vb;
    });
    for (const r of arr) {
      const i = marks.indexOf(r.mark_display);
      if (!sections[i]) sections[i] = [];
      sections[i].push(r);
    }
  }
  if (withoutPlace.length) sections[0] = [...(sections[0] ?? []), ...withoutPlace];
  return sections.filter((s) => s.length > 0);
}

// Rows with is_shadow_result === true are never shown at all -- a weaker
// parallel section (registry/11, 12) or a redundant duplicate mark from a
// merged heat+final (registry/15) that lost out to the athlete's real
// result. is_shadow_result === false (not null: null means "never
// ambiguous to begin with") marks a row that WAS part of a merged
// heat+final and has been resolved -- registry/15_resolve_merged_heats_final.sql
// keeps the verified podium (tablasauxiliares.golden_league_heat_resolution)
// at places 1-3 where known, and ranks the rest of the field by mark
// after that. Shown as two labelled sections, Podium and Rest of times,
// rather than one plain final -- only the podium is fact-checked, the
// rest is a time-based placement among what's left, worth telling apart.
function splitResolved(rows: MeetResultRow[], isField: boolean): { rows: MeetResultRow[]; label?: Group["label"] }[] {
  const visible = rows.filter((r) => !r.is_shadow_result);
  if (visible.length === 0) return [];
  const resolved = visible.some((r) => r.is_shadow_result === false);
  if (!resolved) return splitByMarkTier(visible, isField).map((s) => ({ rows: s }));

  const sorted = [...visible].sort((a, b) => {
    if (a.mark_value == null) return 1;
    if (b.mark_value == null) return -1;
    return isField ? b.mark_value - a.mark_value : a.mark_value - b.mark_value;
  });
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  return [
    { rows: podium, label: "Podium" },
    ...(rest.length ? [{ rows: rest, label: "Rest of times" as const }] : []),
  ];
}

// Never merge rows with a different `round` string -- some meets split a
// discipline into parallel sections ("Final 1"/"Final 2", by pace/seed),
// each with its own real place 1/2/3. They all pass the "is this a final"
// filter upstream, so without this split they'd show up as one fake
// ranking with the same place assigned to several different athletes.
//
// Some sources (confirmed on worldathletics) go further and split a
// discipline into two parallel sections that are BOTH labelled just
// "Final" -- e.g. a faster international heat and a slower national one,
// run back-to-back with their own separate wind reading each. Round text
// alone can't tell those apart, but wind can: a single real race only
// ever has one wind reading, so two different non-null wind values under
// the same round means two different races got merged. Splitting on wind
// too (when present) catches that case without guessing at true places.
export function groupResults(rows: MeetResultRow[]): Group[] {
  const windGroups = new Map<string, { athletics_event: string; gender: string; round: string | null; wind: string | null; rows: MeetResultRow[] }>();
  for (const r of rows) {
    const key = `${r.athletics_event}|${r.gender}|${r.round ?? ""}|${r.wind ?? ""}`;
    let g = windGroups.get(key);
    if (!g) {
      g = { athletics_event: r.athletics_event, gender: r.gender, round: r.round, wind: r.wind, rows: [] };
      windGroups.set(key, g);
    }
    g.rows.push(r);
  }

  const result: Group[] = [];
  for (const g of windGroups.values()) {
    if (isRelayEvent(g.athletics_event)) {
      const level = g.rows.find((r) => r.race_level != null)?.race_level ?? null;
      result.push({ ...g, section: 0, level });
      continue;
    }
    const isField = isFieldEvent(g.athletics_event);
    const sections = splitResolved(g.rows, isField);
    sections.forEach(({ rows: sectionRows, label }, i) => {
      // Always order by the mark itself, not the source's raw `place` --
      // a real final's places already follow its marks, so this is a
      // no-op there; it only matters for a same-place tie, which must
      // still read best-to-worst.
      const sorted = [...sectionRows].sort((a, b) => {
        if (a.mark_value == null) return 1;
        if (b.mark_value == null) return -1;
        return isField ? b.mark_value - a.mark_value : a.mark_value - b.mark_value;
      });
      // race_level is computed once per event+gender+date+round upstream,
      // so every row in a section shares the same value -- take the first
      // non-null one found (a split section's rows are a subset of the
      // same underlying race in that key, so they all agree anyway).
      const level = sectionRows.find((r) => r.race_level != null)?.race_level ?? null;
      result.push({ athletics_event: g.athletics_event, gender: g.gender, round: g.round, wind: g.wind, section: i, rows: sorted, label, level });
    });
  }
  return result;
}

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function ResultRowItem({ r }: { r: MeetResultRow }) {
  const content = (
    <>
      <span className="text-sm flex items-center gap-2 min-w-0">
        <span className="text-neutral-500 font-mono text-xs w-5 shrink-0">{r.place ?? "-"}</span>
        <Flag code={r.nationality} />
        <span className="truncate">{r.display_name}</span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {r.record === "WR" && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
        )}
        <WindBadge wind={r.wind} windLegal={r.wind_legal} />
        <span className="font-mono text-sm text-neutral-300">{r.mark_display}</span>
      </span>
    </>
  );
  if (!r.athlete_id) {
    return <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/40">{content}</div>;
  }
  return (
    <Link href={`/athletes/${r.athlete_id}`} className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/40 hover:bg-neutral-800">
      {content}
    </Link>
  );
}

function RelayGroup({ rows }: { rows: MeetResultRow[] }) {
  const teams = new Map<
    string,
    { place: number | null; nationality: string | null; mark_display: string; record: string | null; roster: { athlete_id: string | null; display_name: string }[] }
  >();
  for (const r of rows) {
    const key = `${r.place}|${r.nationality ?? ""}`;
    let t = teams.get(key);
    if (!t) {
      t = { place: r.place, nationality: r.nationality, mark_display: r.mark_display, record: r.record, roster: [] };
      teams.set(key, t);
    }
    t.roster.push({ athlete_id: r.athlete_id, display_name: r.display_name });
  }
  const list = Array.from(teams.values()).sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
  return (
    <>
      {list.map((t, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/40">
          <span className="text-sm flex items-center gap-2 min-w-0">
            <span className="text-neutral-500 font-mono text-xs w-5 shrink-0">{t.place ?? "-"}</span>
            <Flag code={t.nationality} />
            <span className="truncate">
              {t.nationality ?? "—"}
              <span className="text-neutral-500 font-normal ml-2 text-xs">
                {t.roster.map((a, ri) => (
                  <span key={ri}>
                    {ri > 0 && " · "}
                    {a.athlete_id ? (
                      <Link href={`/athletes/${a.athlete_id}`} className="hover:text-orange-400">
                        {lastName(a.display_name)}
                      </Link>
                    ) : (
                      lastName(a.display_name)
                    )}
                  </span>
                ))}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {t.record === "WR" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
            )}
            <span className="font-mono text-sm text-neutral-300">{t.mark_display}</span>
          </span>
        </div>
      ))}
    </>
  );
}

// Same "is this a final" test as the SQL queries that fetch these rows
// (getMeetResults/getCompetitionResults) -- kept in sync so a round shown
// here always matches whether it actually counts server-side.
function isFinalRound(round: string | null): boolean {
  if (!round) return true;
  const r = round.toLowerCase();
  return r.includes("final") && !r.includes("semifinal") && !r.includes("quarterfinal");
}

export default function MeetResultsSections({ groups, emptyLabel }: { groups: Group[]; emptyLabel: string }) {
  return (
    <div className="flex flex-col gap-6 mt-6">
      {groups.map((g) => {
        const isFinal = isFinalRound(g.round);
        return (
        <section
          key={`${g.athletics_event}|${g.gender}|${g.round ?? ""}|${g.wind ?? ""}|${g.section}`}
          id={meetSectionAnchor(g.athletics_event, g.gender, g.round, g.wind, g.section)}
          className={isFinal ? undefined : "opacity-80"}
        >
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              <Link href={`/disciplines/${eventSlug(g.athletics_event)}`} className="hover:text-orange-400">
                {eventLabel(g.athletics_event)}
              </Link>
              <span className="text-neutral-500 ml-2 normal-case">{g.gender}</span>
              {g.round && <span className="text-neutral-500 ml-2 normal-case">· {g.round}</span>}
              {!isFinal && (
                <span
                  className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 normal-case"
                  title="A qualifying round, not the final -- shown for reference, doesn't score or count towards records"
                >
                  qualifying · doesn&apos;t score
                </span>
              )}
              {g.label && (
                <span
                  className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400 normal-case"
                  title={
                    g.label === "Podium"
                      ? "The source merges a heat and the final here -- this podium is verified against an independent result archive"
                      : "The rest of the field, ranked by mark -- not individually verified the way the podium is"
                  }
                >
                  {g.label}
                </span>
              )}
              {g.level != null && (
                <span
                  className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 normal-case"
                  title="Field strength of this race (0-100): mostly its competition tier, with a smaller adjustment for how strong the actual entrants were"
                >
                  Lvl {Math.round(g.level)}
                </span>
              )}
            </h2>
            {g.wind && <span className="text-xs font-mono text-neutral-500">Wind: {g.wind}</span>}
          </div>
          <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
            {isRelayEvent(g.athletics_event) ? (
              <RelayGroup rows={g.rows} />
            ) : (
              g.rows.map((r, i) => <ResultRowItem key={i} r={r} />)
            )}
          </div>
        </section>
        );
      })}
      {groups.length === 0 && (
        <div className="px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">{emptyLabel}</div>
      )}
    </div>
  );
}
