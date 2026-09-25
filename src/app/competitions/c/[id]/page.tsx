import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { TIER_LABELS } from "@/lib/events";
import { getRegistryCompetition, RULE_LABELS } from "@/lib/registry";

export const dynamic = "force-dynamic";

// One registry competition, laid out to answer "is this grouping right?":
// a year-by-year timeline (gaps, renames, doubled years jump out), the raw
// names grouped under it with the rule that put each one there, and the
// rename links considered -- accepted, rejected and why.

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-neutral-600">—</span>;
  return (
    <span
      title={TIER_LABELS.find((t) => t.value === tier)?.label ?? tier}
      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400"
    >
      {tier}
    </span>
  );
}

const DECISION_STYLE: Record<string, string> = {
  auto: "bg-green-500/15 text-green-300",
  review: "bg-yellow-500/15 text-yellow-300",
  rejected_collision: "bg-red-500/15 text-red-300",
};

const DECISION_LABEL: Record<string, string> = {
  auto: "linked",
  review: "needs review",
  rejected_collision: "rejected: same year, different dates",
};

// base_key "fix|fp|country|city|profile" -> the readable parts
function describeKey(key: string) {
  const [rule, fp, ...rest] = key.split("|");
  return { rule, words: fp.replace(/_/g, " "), rest: rest.join(" · ") };
}

export default async function RegistryCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getRegistryCompetition(id);
  if (!data) notFound();
  const { comp, editions, raws, links } = data;

  // full year range, so missing years show as empty rows
  const years: number[] = [];
  for (let y = comp.last_year; y >= comp.first_year; y--) years.push(y);
  const byYear = new Map(editions.map((e) => [e.year, e]));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <Link href="/competitions" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Competitions
        </Link>
        <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
          {comp.canonical_name} <TierBadge tier={comp.best_tier} />
        </h1>
        <p className="text-sm text-neutral-500 mb-6">
          {[comp.city, comp.country].filter(Boolean).join(", ")} · {comp.profile} · {comp.first_year}–{comp.last_year} ·{" "}
          {comp.n_editions} editions · {comp.n_raw_names} raw names · {comp.sources.join(", ")} ·{" "}
          <code className="text-neutral-600">{comp.competition_id.slice(0, 12)}</code>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-8 items-start">
          {/* Timeline */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Editions</h2>
            <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
              <div className="grid grid-cols-[3rem_5.5rem_2.5rem_1fr] gap-x-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                <span>Year</span>
                <span>Date · city</span>
                <span>Tier</span>
                <span>Raw names · sources</span>
              </div>
              {years.map((y) => {
                const e = byYear.get(y);
                if (!e)
                  return (
                    <div key={y} className="grid grid-cols-[3rem_5.5rem_2.5rem_1fr] gap-x-2 px-3 py-1.5 text-xs text-neutral-600 bg-neutral-950">
                      <span>{y}</span>
                      <span className="col-span-3 italic">no edition</span>
                    </div>
                  );
                const doubled = e.n_dates > 1;
                return (
                  <div
                    key={y}
                    className={`grid grid-cols-[3rem_5.5rem_2.5rem_1fr] gap-x-2 px-3 py-2 text-sm ${
                      doubled ? "bg-yellow-500/10" : "bg-neutral-900/40"
                    }`}
                  >
                    <span className="font-medium">{y}</span>
                    <span className="text-xs text-neutral-400">
                      {e.date?.slice(5) ?? "—"}
                      <br />
                      <span className="text-neutral-500">{e.city ?? "?"}</span>
                    </span>
                    <span>
                      <TierBadge tier={e.best_tier} />
                    </span>
                    <span className="text-xs min-w-0">
                      {doubled && <span className="text-yellow-300">⚠ {e.n_dates} different dates · </span>}
                      {e.raw_names.map((n, i) => (
                        <span key={n}>
                          {i > 0 && <span className="text-neutral-600"> · </span>}
                          <Link
                            href={`/meets/${encodeURIComponent(n)}?year=${y}`}
                            className="text-neutral-200 hover:text-orange-400"
                          >
                            {n}
                          </Link>
                        </span>
                      ))}
                      <span className="text-neutral-500"> ({e.sources.join(", ")}, {e.n_rows} rows)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex flex-col gap-8">
            {/* Why: raw names and their rule */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">Why these raw names</h2>
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                {raws.map((r, i) => {
                  const k = describeKey(r.base_key);
                  return (
                    <div key={i} className="px-3 py-2 bg-neutral-900/40 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium min-w-0">{r.event_name}</span>
                        <span className="text-[11px] text-neutral-500 shrink-0">{r.source}</span>
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        <span className="text-neutral-200">{RULE_LABELS[k.rule] ?? k.rule}</span>
                        {" · "}words <code className="text-neutral-300">{k.words}</code>
                        {k.rest && <> · {k.rest}</>}
                        {" · "}
                        {r.years.length > 6 ? `${r.years[0]}…${r.years[r.years.length - 1]} (${r.years.length})` : r.years.join(", ")}
                      </div>
                      {r.other_competitions > 0 && (
                        <div className="text-[11px] text-yellow-300 mt-0.5">
                          ⚠ this raw name also lands in {r.other_competitions} other competition{r.other_competitions > 1 ? "s" : ""}{" "}
                          (<Link href={`/competitions?tab=raw&q=${encodeURIComponent(r.event_name)}`} className="underline">see where</Link>)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Rename links */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-1">Rename links</h2>
              <p className="text-[11px] text-neutral-500 mb-3">
                Groups with different names joined because they share city, country, type and month, and either ran
                on the same date or one ends when the other starts.
              </p>
              {links.length === 0 ? (
                <p className="text-sm text-neutral-500">None considered.</p>
              ) : (
                <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
                  {links.map((l, i) => {
                    const a = describeKey(l.key_a);
                    const b = describeKey(l.key_b);
                    return (
                      <div key={i} className="px-3 py-2 bg-neutral-900/40 text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${DECISION_STYLE[l.decision] ?? "bg-neutral-800 text-neutral-400"}`}>
                            {DECISION_LABEL[l.decision] ?? l.decision}
                          </span>
                          <span className="text-neutral-500">
                            {l.same_date ? "same date" : l.no_overlap ? `consecutive runs, gap ${l.gap_years}y` : "overlapping years"}
                          </span>
                        </div>
                        <div className="text-neutral-300">
                          <code>{a.words}</code> ↔ <code>{b.words}</code>
                        </div>
                        {!l.inside && l.other_id && (
                          <div className="text-neutral-500 mt-0.5">
                            other side:{" "}
                            <Link href={`/competitions/c/${l.other_id}`} className="text-orange-400 hover:underline">
                              {l.other_name}
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
