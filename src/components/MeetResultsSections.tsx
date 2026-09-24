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
function splitByMarkIfDuplicatePlaces(rows: MeetResultRow[], isField: boolean): MeetResultRow[][] {
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
    const sorted = [...arr].sort((a, b) => {
      if (a.mark_value == null) return 1;
      if (b.mark_value == null) return -1;
      return isField ? b.mark_value - a.mark_value : a.mark_value - b.mark_value;
    });
    sorted.forEach((r, i) => {
      if (!sections[i]) sections[i] = [];
      sections[i].push(r);
    });
  }
  if (withoutPlace.length) sections[0] = [...(sections[0] ?? []), ...withoutPlace];
  return sections.filter((s) => s.length > 0);
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
      result.push({ ...g, section: 0 });
      continue;
    }
    const sections = splitByMarkIfDuplicatePlaces(g.rows, isFieldEvent(g.athletics_event));
    sections.forEach((sectionRows, i) => {
      result.push({ athletics_event: g.athletics_event, gender: g.gender, round: g.round, wind: g.wind, section: i, rows: sectionRows });
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
  const teams = new Map<string, { place: number | null; nationality: string | null; mark_display: string; record: string | null; roster: string[] }>();
  for (const r of rows) {
    const key = `${r.place}|${r.nationality ?? ""}`;
    let t = teams.get(key);
    if (!t) {
      t = { place: r.place, nationality: r.nationality, mark_display: r.mark_display, record: r.record, roster: [] };
      teams.set(key, t);
    }
    t.roster.push(r.display_name);
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
              <span className="text-neutral-500 font-normal ml-2 text-xs">{t.roster.map(lastName).join(" · ")}</span>
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

export default function MeetResultsSections({ groups, emptyLabel }: { groups: Group[]; emptyLabel: string }) {
  return (
    <div className="flex flex-col gap-6 mt-6">
      {groups.map((g) => (
        <section
          key={`${g.athletics_event}|${g.gender}|${g.round ?? ""}|${g.wind ?? ""}|${g.section}`}
          id={meetSectionAnchor(g.athletics_event, g.gender, g.round, g.wind, g.section)}
        >
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              <Link href={`/events/${eventSlug(g.athletics_event)}`} className="hover:text-orange-400">
                {eventLabel(g.athletics_event)}
              </Link>
              <span className="text-neutral-500 ml-2 normal-case">{g.gender}</span>
              {g.round && <span className="text-neutral-500 ml-2 normal-case">· {g.round}</span>}
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
      ))}
      {groups.length === 0 && (
        <div className="px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">{emptyLabel}</div>
      )}
    </div>
  );
}
