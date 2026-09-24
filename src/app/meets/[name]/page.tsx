import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Flag from "@/components/Flag";
import WindBadge from "@/components/WindBadge";
import YearSelect from "@/components/YearSelect";
import MeetFilters from "@/components/MeetFilters";
import { getMeetAvailableYears, getMeetResults, type MeetResultRow } from "@/lib/queries";
import { eventLabel, isRelayEvent, EVENT_GROUPS } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

export const revalidate = 3600;

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type Group = {
  athletics_event: string;
  gender: string;
  round: string | null;
  wind: string | null;
  rows: MeetResultRow[];
};

export function meetSectionAnchor(athleticsEvent: string, gender: string, round?: string | null, wind?: string | null): string {
  const base = `${eventSlug(athleticsEvent)}-${gender.toLowerCase()}`;
  const withRound = round ? `${base}-${eventSlug(round)}` : base;
  return wind ? `${withRound}-${eventSlug(wind)}` : withRound;
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
function groupResults(rows: MeetResultRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.athletics_event}|${r.gender}|${r.round ?? ""}|${r.wind ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { athletics_event: r.athletics_event, gender: r.gender, round: r.round, wind: r.wind, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(r);
  }
  return Array.from(groups.values());
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
  // Collapse one row per runner into one row per team (place + nationality).
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

export default async function MeetPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ year?: string; discipline?: string; gender?: string; category?: string }>;
}) {
  const { name } = await params;
  const eventName = decodeURIComponent(name);
  const { year: yearParam, discipline: disciplineParam, gender: genderParam, category: categoryParam } = await searchParams;

  const years = await getMeetAvailableYears(eventName);
  if (years.length === 0) notFound();

  const year = yearParam ? Number(yearParam) : years[0];
  const results = await getMeetResults(eventName, year);
  const allGroups = groupResults(results).sort(
    (a, b) => a.athletics_event.localeCompare(b.athletics_event) || (a.round ?? "").localeCompare(b.round ?? "")
  );
  const first = results[0];
  const meetDate = formatDate(first?.date ?? null);

  const disciplineOptions = Array.from(new Set(allGroups.map((g) => g.athletics_event)))
    .sort((a, b) => a.localeCompare(b))
    .map((e) => ({ value: e, label: eventLabel(e) }));
  const genderOptions = Array.from(new Set(allGroups.map((g) => g.gender)));
  // Only offer category pills (Sprints, Long Distance, ...) this meet
  // actually has results for, instead of the full fixed catalog.
  const disciplineSet = new Set(disciplineOptions.map((d) => d.value));
  const categoryOptions = EVENT_GROUPS.filter((g) =>
    [...g.events.Men, ...g.events.Women].some((ev) => disciplineSet.has(ev))
  ).map((g) => ({ key: g.key, label: g.label }));

  const category = categoryParam && categoryOptions.some((c) => c.key === categoryParam) ? categoryParam : "";
  const categoryGroup = category ? EVENT_GROUPS.find((g) => g.key === category)! : null;
  const categoryDisciplines: Set<string> | null = categoryGroup
    ? new Set([...categoryGroup.events.Men, ...categoryGroup.events.Women])
    : null;
  const discipline = disciplineParam && disciplineOptions.some((d) => d.value === disciplineParam) ? disciplineParam : "";
  const gender = genderParam && genderOptions.includes(genderParam) ? genderParam : "";
  const groups = allGroups.filter(
    (g) =>
      (!discipline || g.athletics_event === discipline) &&
      (!gender || g.gender === gender) &&
      (!categoryDisciplines || categoryDisciplines.has(g.athletics_event))
  );
  // Discipline dropdown narrows to the selected category too, so it
  // doesn't offer picking e.g. Long Jump while "Sprints" is active.
  const visibleDisciplineOptions = categoryDisciplines
    ? disciplineOptions.filter((d) => categoryDisciplines.has(d.value))
    : disciplineOptions;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{first?.series_name ?? eventName}</h1>
            {(first?.city || meetDate) && (
              <p className="text-sm text-neutral-400">
                {first?.city}{first?.country ? `, ${first.country}` : ""}
                {meetDate && <span className="text-neutral-500">{first?.city ? " · " : ""}{meetDate}</span>}
              </p>
            )}
          </div>
          <YearSelect years={years} year={year} baseHref={`/meets/${encodeURIComponent(eventName)}`} />
        </div>

        <div className="mt-4">
          <MeetFilters
            disciplines={visibleDisciplineOptions}
            categories={categoryOptions}
            category={category}
            genders={genderOptions}
            discipline={discipline}
            gender={gender}
            year={year}
            baseHref={`/meets/${encodeURIComponent(eventName)}`}
          />
        </div>

        <div className="flex flex-col gap-6 mt-6">
          {groups.map((g) => {
            return (
            <section key={`${g.athletics_event}|${g.gender}|${g.round ?? ""}|${g.wind ?? ""}`} id={meetSectionAnchor(g.athletics_event, g.gender, g.round, g.wind)}>
              <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                  <Link href={`/events/${eventSlug(g.athletics_event)}`} className="hover:text-orange-400">
                    {eventLabel(g.athletics_event)}
                  </Link>
                  <span className="text-neutral-500 ml-2 normal-case">{g.gender}</span>
                  {g.round && <span className="text-neutral-500 ml-2 normal-case">· {g.round}</span>}
                </h2>
                {g.wind && (
                  <span className="text-xs font-mono text-neutral-500">Wind: {g.wind}</span>
                )}
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
            <div className="px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">
              No results for {year}.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
