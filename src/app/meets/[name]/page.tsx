import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import YearSelect from "@/components/YearSelect";
import MeetFilters from "@/components/MeetFilters";
import MeetResultsSections, { groupResults } from "@/components/MeetResultsSections";
import { getMeetAvailableYears, getMeetResults, getMeetSeriesKey, getMeetYearsFromEvents, getMeetResultsFromEvents, getMeetEventMatrix, getMeetEventMatrixFromEvents, getMeetEditions, getAthleteSlugs } from "@/lib/queries";
import MeetEventStats from "@/components/MeetEventStats";
import { eventLabel, EVENT_GROUPS, TIER_LABELS, tierPriority } from "@/lib/events";

export const revalidate = 3600;

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function tierLabel(code: string) {
  return TIER_LABELS.find((t) => t.value === code)?.label ?? code;
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const eventName = decodeURIComponent(name);
  const title = `${eventName} - results`;
  const description = `${eventName}: results by year and discipline, with the best marks and winners of every edition.`;
  return { title, description, alternates: { canonical: `/meets/${name}` }, openGraph: { title, description } };
}

export default async function MeetPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ year?: string; discipline?: string; gender?: string; category?: string; date?: string }>;
}) {
  const { name } = await params;
  const eventName = decodeURIComponent(name);
  const { year: yearParam, discipline: disciplineParam, gender: genderParam, category: categoryParam, date: dateParam } = await searchParams;

  // series_key is resolved once and shared with every query below instead
  // of each re-resolving it (that used to be two identical round trips).
  const seriesKey = await getMeetSeriesKey(eventName);
  const requestedYear = yearParam ? Number(yearParam) : null;

  const materializedYears = await getMeetAvailableYears(eventName, seriesKey);

  // A meet whose series_key resolved but that has no rows in the
  // materialized meet_results at all is a combined-events
  // (decathlon/heptathlon) meet: 19_materialize_meet_results.sql drops
  // every combined round (`round NOT LIKE '%combined%'`), so
  // getMeetAvailableYears comes back empty and this page used to 404 even
  // though the meet -- and its sub-event marks, shown on each competing
  // athlete's profile -- plainly exists. Fall back to reading `events`
  // directly so the page opens and shows those same sub-event results.
  const combinedEventsOnly = seriesKey != null && materializedYears.length === 0;

  const years = combinedEventsOnly ? await getMeetYearsFromEvents(eventName) : materializedYears;
  if (years.length === 0) notFound();

  const year = requestedYear ?? years[0];

  // The cheap (athletics_event, gender) matrix for this meet/year drives
  // every filter control below and decides which single discipline this
  // page actually loads -- see getMeetEventMatrix for why the options are
  // built from it rather than from the results themselves.
  // Una misma reunion puede repetirse en fechas separadas el mismo año (las citas de una liga: ACNW League 24 feb y 9 may): son
  // competiciones distintas y cada una tiene su pagina. ?date= es cualquier fecha de la edicion; sin ella, la mas reciente.
  const editions = combinedEventsOnly ? [] : await getMeetEditions(eventName, year, seriesKey);
  const edition = editions.length > 1
    ? (editions.find((e) => dateParam && dateParam >= e.from && dateParam <= e.to) ?? editions[editions.length - 1])
    : null;
  const range = edition ? { from: edition.from, to: edition.to } : {};

  const matrix = combinedEventsOnly
    ? await getMeetEventMatrixFromEvents(eventName, year)
    : await getMeetEventMatrix(eventName, year, seriesKey, range.from, range.to);
  const gendersByDiscipline = new Map<string, Set<string>>();
  for (const row of matrix) {
    const set = gendersByDiscipline.get(row.athletics_event) ?? new Set<string>();
    set.add(row.gender);
    gendersByDiscipline.set(row.athletics_event, set);
  }
  const allDisciplines = [...gendersByDiscipline.keys()].sort((a, b) => a.localeCompare(b));
  if (allDisciplines.length === 0) notFound();

  // Category pills (Sprints, Long Distance, ...): only groups this meet
  // actually has results for, instead of the full fixed catalog.
  const categoryOptions = EVENT_GROUPS.filter((g) =>
    [...g.events.Men, ...g.events.Women].some((ev) => gendersByDiscipline.has(ev))
  ).map((g) => ({ key: g.key, label: g.label }));
  const category = categoryParam && categoryOptions.some((c) => c.key === categoryParam) ? categoryParam : "";
  const categoryGroup = category ? EVENT_GROUPS.find((g) => g.key === category)! : null;
  const categoryDisciplines: Set<string> | null = categoryGroup
    ? new Set([...categoryGroup.events.Men, ...categoryGroup.events.Women])
    : null;

  // This page shows ONE discipline at a time (defaulting to the first,
  // alphabetically) instead of every discipline of the meet at once -- that
  // used to render an 8,499-row meet as a single 16MB page. The rest are
  // reached through the discipline dropdown. A discipline stays selectable
  // only if it has results for the selected gender and category, so a stale
  // or hand-edited URL (e.g. 100 Metres Hurdles + Men, which has no rows)
  // resolves to the nearest combination that does exist, rather than
  // rendering an empty page while still offering the empty combination.
  const hasGender = (d: string) => !genderParam || (gendersByDiscipline.get(d)?.has(genderParam) ?? false);
  const inCategory = (d: string) => !categoryDisciplines || categoryDisciplines.has(d);
  const discipline =
    disciplineParam && gendersByDiscipline.has(disciplineParam) && hasGender(disciplineParam) && inCategory(disciplineParam)
      ? disciplineParam
      : allDisciplines.find((d) => inCategory(d) && hasGender(d)) ??
        allDisciplines.find((d) => inCategory(d)) ??
        allDisciplines.find((d) => hasGender(d)) ??
        allDisciplines[0];

  // Gender buttons: only the genders this discipline has results for --
  // the other half of never offering a combination that yields nothing.
  const disciplineGenders = [...(gendersByDiscipline.get(discipline) ?? [])].sort((a, b) =>
    a === "Men" ? -1 : b === "Men" ? 1 : a.localeCompare(b)
  );
  const gender = genderParam && disciplineGenders.includes(genderParam) ? genderParam : "";

  // Only this discipline's (+ gender's) rows are fetched, so they're the
  // only ones grouped and rendered -- the filter is pushed into SQL, not
  // applied to a fully-fetched meet afterwards.
  const results = combinedEventsOnly
    ? await getMeetResultsFromEvents(eventName, year, { discipline, gender: gender || undefined })
    : await getMeetResults(eventName, year, seriesKey, { discipline, gender: gender || undefined, ...range });
  const athleteSlugs = await getAthleteSlugs(results.map((r) => r.athlete_id).filter((id): id is string => !!id));
  const allGroups = groupResults(results).sort(
    (a, b) => a.athletics_event.localeCompare(b.athletics_event) || (a.round ?? "").localeCompare(b.round ?? "") || a.section - b.section
  );
  const first = results[0];
  // A given edition can carry more than one tier across sources -- e.g.
  // worldathletics tags a Diamond League Final edition "DF", but an older
  // dlmeetings duplicate of the very same edition has no real tier data
  // and defaults to "GW" -- showing both looks like a real inconsistency
  // when it's really just a lesser source's fallback next to the true
  // value. Show only the single highest-prestige tier found (tierPriority),
  // not every distinct value.
  const bestTier = results
    .map((r) => r.division_key_resolved)
    .filter((t): t is string => !!t)
    .sort((a, b) => tierPriority(a) - tierPriority(b))[0];

  // Discipline dropdown: only disciplines that have results for the
  // selected gender, so switching to "Men" doesn't leave e.g. 100 Metres
  // Hurdles (a Women-only field) in the list.
  const disciplineOptions = allDisciplines
    .filter((d) => !gender || (gendersByDiscipline.get(d)?.has(gender) ?? false))
    .map((d) => ({ value: d, label: eventLabel(d) }));

  // Discipline dropdown narrows to the selected category too, so it
  // doesn't offer picking e.g. Long Jump while "Sprints" is active.
  const visibleDisciplineOptions =
    categoryDisciplines && categoryDisciplines.has(discipline)
      ? disciplineOptions.filter((d) => categoryDisciplines.has(d.value))
      : disciplineOptions;
  // Results were already narrowed to one discipline (+ gender) in SQL, so
  // the groups to render are just the grouped result set.
  const groups = allGroups;

  // The header date: a multi-day meet's disciplines run on different days
  // (e.g. Asian Games 2026 -- 100m on day 3, Marathon on day 4), so once a
  // discipline/gender/category filter narrows the page down, the date
  // shown must come from THAT filtered result set, not just the
  // alphabetically-first discipline overall (getMeetResults sorts by
  // athletics_event, so "100 Metres" was silently deciding the date shown
  // even while viewing the Marathon).
  const dateSource = groups.length > 0 ? groups.flatMap((g) => g.rows) : results;
  const meetDate = formatDate(dateSource[0]?.date ?? results[0]?.date ?? null);

  // the event the side column talks about: the selected one, else the first
  // one shown; same for gender
  const statsEvent = discipline || groups[0]?.athletics_event || "";
  const statsGenders = Array.from(new Set(allGroups.filter((g) => g.athletics_event === statsEvent).map((g) => g.gender)))
    .filter((g) => g === "Men" || g === "Women");
  const statsGender = (gender && (statsGenders as string[]).includes(gender) ? gender : statsGenders[0]) ?? "";

  // no known city -> just the country, never a dangling ", ESP"
  const place = [first?.city, first?.country].filter(Boolean).join(", ") || null;

  return (
    <div className="min-h-screen bg-canvas text-neutral-100 -mb-24 pb-24 sm:mb-0 sm:pb-0">
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap bg-tint rounded-lg px-3 sm:px-4 py-2">
          <div>
            {/* Itinerant series (World Champs, Grand Prix Final, ...) share
                one display_series_name across editions hosted in different
                cities each year -- showing that anchor name here would label
                e.g. a 2001 Melbourne edition "Paris IAAF Grand Prix Final"
                just because Paris 2002 happened to have more rows and got
                picked as the series' representative name. The edition's own
                event_name always matches the city/date actually shown below. */}
            <h1 className="text-2xl font-bold">{first?.event_name ?? eventName}</h1>
            {(place || meetDate || bestTier) && (
              <p className="text-sm text-neutral-400 flex items-center gap-2 flex-wrap">
                <span>
                  {place}
                  {meetDate && <span className="text-neutral-500">{place ? " · " : ""}{meetDate}</span>}
                </span>
                {bestTier && (
                  <span title={tierLabel(bestTier)} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                    {bestTier}
                  </span>
                )}
              </p>
            )}
          </div>
          <YearSelect years={years} year={year} baseHref={`/meets/${encodeURIComponent(eventName)}`} />
        </div>

        {edition && (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Editions">
            <span className="text-xs text-neutral-500">{editions.length} dates in {year}:</span>
            {editions.map((e) => {
              const active = e.from === edition.from;
              const label = `${formatDate(e.from)?.replace(/ \d{4}$/, "")}${e.to !== e.from ? `–${formatDate(e.to)?.replace(/ \d{4}$/, "")}` : ""}${e.city ? ` · ${e.city}` : ""}`;
              return (
                <a
                  key={e.from}
                  href={`/meets/${encodeURIComponent(eventName)}?year=${year}&date=${e.from}`}
                  className={`text-xs px-2.5 py-1 rounded-full border ${active ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-orange-500"}`}
                >
                  {label}
                </a>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          <MeetFilters
            disciplines={visibleDisciplineOptions}
            categories={categoryOptions}
            category={category}
            genders={disciplineGenders}
            discipline={discipline}
            gender={gender}
            year={year}
            edition={edition?.from}
            baseHref={`/meets/${encodeURIComponent(eventName)}`}
          />
        </div>

        {/* Ediciones historicas de las que solo se conoce el podio (tabla Event|Gold|Silver|Bronze de Wikipedia):
            todas las carreras mostradas tienen como mucho 3 resultados. Se avisa para que no parezca un dato incompleto por error. */}
        {groups.length >= 2 && groups.every((g) => g.rows.length <= 3) && (
          <p className="mt-3 text-xs text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2">
            Podium only: for this edition the source lists just the top three of each event, so full results (heats, finalists) are not available.
          </p>
        )}

        {/* results | history of the selected event at this meet */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0">
            <MeetResultsSections groups={groups} emptyLabel={`No results for ${year}.`} athleteSlugs={athleteSlugs} />
          </div>
          {statsEvent && statsGender && (
            <div>
              <Suspense fallback={<div className="h-64 rounded-lg border border-neutral-800 bg-neutral-950 animate-pulse" />}>
                <MeetEventStats
                eventName={eventName}
                event={statsEvent}
                gender={statsGender}
                genders={statsGenders}
                genderHref={(g) => {
                  const q = new URLSearchParams({ year: String(year), discipline: statsEvent, gender: g });
                  if (edition) q.set("date", edition.from);
                  if (category) q.set("category", category);
                  return `/meets/${encodeURIComponent(eventName)}?${q.toString()}`;
                }}
              />
              </Suspense>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
