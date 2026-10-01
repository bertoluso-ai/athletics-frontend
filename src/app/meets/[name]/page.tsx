import { notFound } from "next/navigation";
import Header from "@/components/Header";
import YearSelect from "@/components/YearSelect";
import MeetFilters from "@/components/MeetFilters";
import MeetResultsSections, { groupResults } from "@/components/MeetResultsSections";
import { getMeetAvailableYears, getMeetResults, getAthleteSlugs } from "@/lib/queries";
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <div>
            {/* Itinerant series (World Champs, Grand Prix Final, ...) share
                one display_series_name across editions hosted in different
                cities each year -- showing that anchor name here would label
                e.g. a 2001 Melbourne edition "Paris IAAF Grand Prix Final"
                just because Paris 2002 happened to have more rows and got
                picked as the series' representative name. The edition's own
                event_name always matches the city/date actually shown below. */}
            <h1 className="text-2xl font-bold">{first?.event_name ?? eventName}</h1>
            {(first?.city || meetDate || bestTier) && (
              <p className="text-sm text-neutral-400 flex items-center gap-2 flex-wrap">
                <span>
                  {first?.city}{first?.country ? `, ${first.country}` : ""}
                  {meetDate && <span className="text-neutral-500">{first?.city ? " · " : ""}{meetDate}</span>}
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

        {/* results | history of the selected event at this meet */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0">
            <MeetResultsSections groups={groups} emptyLabel={`No results for ${year}.`} athleteSlugs={athleteSlugs} />
          </div>
          {statsEvent && statsGender && (
            <div>
              <MeetEventStats
                eventName={eventName}
                event={statsEvent}
                gender={statsGender}
                genders={statsGenders}
                genderHref={(g) => {
                  const q = new URLSearchParams({ year: String(year), discipline: statsEvent, gender: g });
                  if (category) q.set("category", category);
                  return `/meets/${encodeURIComponent(eventName)}?${q.toString()}`;
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
