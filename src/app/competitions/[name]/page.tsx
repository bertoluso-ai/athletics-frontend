import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import YearSelect from "@/components/YearSelect";
import MeetResultsSections, { groupResults } from "@/components/MeetResultsSections";
import { getCompetitionResults, getCompetitionYears } from "@/lib/queries";
import { TIER_LABELS } from "@/lib/events";

function tierLabel(code: string) {
  return TIER_LABELS.find((t) => t.value === code)?.label ?? code;
}

export const revalidate = 3600;

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Strict single-raw-name view (no display_series_name grouping) -- the
// point is debugging exactly what one specific raw source row contains,
// e.g. spotting a competition wrongly merged into (or wrongly left out
// of) a bigger series. See /meets/[name] for the normal, grouped page.
export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { name } = await params;
  const eventName = decodeURIComponent(name);
  const { year: yearParam } = await searchParams;

  const years = await getCompetitionYears(eventName);
  if (years.length === 0) notFound();

  const year = yearParam ? Number(yearParam) : years[0];
  const results = await getCompetitionResults(eventName, year);
  const groups = groupResults(results).sort(
    (a, b) => a.athletics_event.localeCompare(b.athletics_event) || (a.round ?? "").localeCompare(b.round ?? "") || a.section - b.section
  );
  const first = results[0];
  const date = formatDate(first?.date ?? null);
  const tiers = Array.from(new Set(results.map((r) => r.division_key_resolved).filter((t): t is string => !!t)));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <Link href="/competitions" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Competitions
        </Link>
        <div className="flex items-center justify-between mb-2 mt-2 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{eventName}</h1>
            {first?.series_name && first.series_name !== eventName && (
              <p className="text-xs text-orange-400 mt-1">Grouped under: {first.series_name}</p>
            )}
            {(first?.city || date) && (
              <p className="text-sm text-neutral-400">
                {first?.city}{first?.country ? `, ${first.country}` : ""}
                {date && <span className="text-neutral-500">{first?.city ? " · " : ""}{date}</span>}
              </p>
            )}
            {tiers.length > 0 && (
              <p className="text-xs text-neutral-500 mt-1">
                Tier: {tiers.map((t) => `${t} (${tierLabel(t)})`).join(", ")}
              </p>
            )}
          </div>
          <YearSelect years={years} year={year} baseHref={`/competitions/${encodeURIComponent(eventName)}`} />
        </div>

        <MeetResultsSections groups={groups} emptyLabel={`No results for ${year}.`} />
      </main>
    </div>
  );
}
