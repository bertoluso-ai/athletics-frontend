import { notFound } from "next/navigation";
import Header from "@/components/Header";
import YearSelect from "@/components/YearSelect";
import MeetFilters from "@/components/MeetFilters";
import MeetResultsSections, { groupResults } from "@/components/MeetResultsSections";
import { getMeetAvailableYears, getMeetResults } from "@/lib/queries";
import { eventLabel, EVENT_GROUPS, TIER_LABELS } from "@/lib/events";

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
  const allGroups = groupResults(results).sort(
    (a, b) => a.athletics_event.localeCompare(b.athletics_event) || (a.round ?? "").localeCompare(b.round ?? "") || a.section - b.section
  );
  const first = results[0];
  const meetDate = formatDate(first?.date ?? null);
  const tiers = Array.from(new Set(results.map((r) => r.division_key_resolved).filter((t): t is string => !!t)));

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
            {(first?.city || meetDate || tiers.length > 0) && (
              <p className="text-sm text-neutral-400 flex items-center gap-2 flex-wrap">
                <span>
                  {first?.city}{first?.country ? `, ${first.country}` : ""}
                  {meetDate && <span className="text-neutral-500">{first?.city ? " · " : ""}{meetDate}</span>}
                </span>
                {tiers.map((t) => (
                  <span key={t} title={tierLabel(t)} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                    {t}
                  </span>
                ))}
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

        <MeetResultsSections groups={groups} emptyLabel={`No results for ${year}.`} />
      </main>
    </div>
  );
}
