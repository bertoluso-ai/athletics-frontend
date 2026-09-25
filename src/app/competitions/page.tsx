import Link from "next/link";
import Header from "@/components/Header";
import CompetitionsExplorer from "@/components/CompetitionsExplorer";
import VerdictButtons from "@/components/registry/VerdictButtons";
import { TIER_LABELS } from "@/lib/events";
import {
  listRegistryCompetitions,
  listRegistryDiffs,
  lookupRawName,
  type RegistryFlag,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

// Debugging workspace for the competition registry (the new grouping,
// athletics-database.registry.*) while it's validated against what
// production shows today. Not linked for the general public yet -- once the
// grouping is signed off this becomes the public competitions section.

const TABS = [
  { key: "list", label: "Competitions" },
  { key: "diff", label: "Differences vs production" },
  { key: "raw", label: "Raw name lookup" },
  { key: "legacy", label: "Production grouping" },
] as const;

const FLAGS: { key: RegistryFlag; label: string; help: string }[] = [
  { key: "multi_date", label: "Same year, 2+ dates", help: "Editions more than 3 days apart in one year: likely two different meets merged" },
  { key: "raw_split", label: "Raw name split", help: "A raw name that also lands in another competition" },
  { key: "missing_years", label: "Missing years", help: "Gaps between the first and last edition" },
  { key: "diff", label: "Differs from production", help: "Grouped differently from what the site shows today" },
];

function tierTitle(code: string | null) {
  return TIER_LABELS.find((t) => t.value === code)?.label ?? code ?? "";
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span title={tierTitle(tier)} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
      {tier}
    </span>
  );
}

const RANK_TO_TIER = ["OW", "DF", "GW", "GL", "A", "B", "C", "D", "E", "F"];

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; flag?: string; tier?: string; kind?: string; pending?: string }>;
}) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "list";
  const q = sp.q?.trim() ?? "";

  function tabHref(key: string) {
    return `/competitions?tab=${key}`;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-1">Competitions</h1>
        <p className="text-sm text-neutral-500 mb-4">
          Grouping debugger: the new competition registry, why each competition was grouped the way it is, and
          where it disagrees with what the site shows today.
        </p>

        <div className="pill-row flex flex-nowrap overflow-x-auto gap-1 mb-5 border-b border-neutral-800">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`shrink-0 text-sm px-3 py-2 border-b-2 -mb-px ${
                tab === t.key ? "border-orange-500 text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {tab === "list" && <ListTab q={q} flag={(sp.flag ?? "") as RegistryFlag | ""} tier={sp.tier ?? ""} />}
        {tab === "diff" && <DiffTab kind={sp.kind ?? ""} pending={sp.pending === "1"} />}
        {tab === "raw" && <RawTab q={q} />}
        {tab === "legacy" && <CompetitionsExplorer />}
      </main>
    </div>
  );
}

async function ListTab({ q, flag, tier }: { q: string; flag: RegistryFlag | ""; tier: string }) {
  const rows = await listRegistryCompetitions({ q, flag, tier, limit: 300 });
  const selectClass = "bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700";
  return (
    <>
      <form className="flex flex-wrap items-center gap-2 mb-4" action="/competitions">
        <input type="hidden" name="tab" value="list" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Name or any raw name…"
          className="flex-1 min-w-[12rem] bg-neutral-900 text-sm rounded px-3 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
        />
        <select name="flag" defaultValue={flag} className={selectClass}>
          <option value="">All competitions</option>
          {FLAGS.map((f) => (
            <option key={f.key} value={f.key}>
              ⚠ {f.label}
            </option>
          ))}
        </select>
        <select name="tier" defaultValue={tier} className={selectClass}>
          <option value="">All tiers</option>
          {TIER_LABELS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value} · {t.label}
            </option>
          ))}
        </select>
        <button className="text-xs px-3 py-1.5 rounded bg-orange-500 text-black font-semibold">Search</button>
      </form>

      <div className="text-[11px] text-neutral-500 mb-2">
        {rows.length === 300 ? "First 300" : rows.length} competitions, best tier first.{" "}
        {FLAGS.map((f) => (
          <span key={f.key} className="mr-3" title={f.help}>
            ⚠ {f.label}
          </span>
        ))}
      </div>

      <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
        {rows.map((c) => {
          const warnings = [
            c.n_multi_date_years > 0 && `${c.n_multi_date_years}y with 2+ dates`,
            c.n_raw_split > 0 && `${c.n_raw_split} raw split`,
            c.n_missing_years > 0 && `${c.n_missing_years} missing years`,
            c.in_diff && "differs from prod",
          ].filter(Boolean) as string[];
          return (
            <Link
              key={c.competition_id}
              href={`/competitions/c/${c.competition_id}`}
              className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2 bg-neutral-900/40 hover:bg-neutral-800"
            >
              <span className="flex items-center gap-2 min-w-0 sm:flex-1">
                <TierBadge tier={c.best_tier} />
                <span className="font-medium truncate">{c.canonical_name}</span>
              </span>
              <span className="text-xs text-neutral-500 sm:w-40 truncate">
                {[c.city, c.country].filter(Boolean).join(", ")} · {c.profile}
              </span>
              <span className="text-xs text-neutral-400 sm:w-24 tabular-nums">
                {c.first_year}–{c.last_year}
              </span>
              <span className="text-xs text-neutral-500 sm:w-36 tabular-nums">
                {c.n_editions} ed · {c.n_raw_names} raw · {c.sources.map((s) => s.slice(0, 2).toUpperCase()).join("/")}
              </span>
              <span className="flex flex-wrap gap-1 sm:w-64 sm:justify-end">
                {warnings.map((w) => (
                  <span key={w} className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300">
                    ⚠ {w}
                  </span>
                ))}
              </span>
            </Link>
          );
        })}
        {rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No competitions match.</div>}
      </div>
    </>
  );
}

async function DiffTab({ kind, pending }: { kind: string; pending: boolean }) {
  const rows = await listRegistryDiffs({ kind, pending });
  const pill = (active: boolean) =>
    `text-xs px-2.5 py-1 rounded-full border ${active ? "bg-neutral-100 text-black border-neutral-100" : "border-neutral-700 text-neutral-400"}`;
  const href = (k: string, p: boolean) => `/competitions?tab=diff${k ? `&kind=${k}` : ""}${p ? "&pending=1" : ""}`;
  return (
    <>
      <p className="text-sm text-neutral-400 mb-3">
        <b className="text-neutral-200">MERGE</b>: the registry joins what the site shows today as separate
        competitions. <b className="text-neutral-200">SPLIT</b>: the site lumps together what the registry keeps
        apart. Mark each one: every verdict becomes a regression test, so a later change can&apos;t silently undo it.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Link href={href("", pending)} className={pill(!kind)}>All</Link>
        <Link href={href("MERGE", pending)} className={pill(kind === "MERGE")}>Merges</Link>
        <Link href={href("SPLIT", pending)} className={pill(kind === "SPLIT")}>Splits</Link>
        <Link href={href(kind, !pending)} className={`${pill(pending)} ml-2`}>Only pending</Link>
        <span className="text-xs text-neutral-500 self-center ml-2">
          {rows.length} shown · {rows.filter((r) => r.verdict).length} reviewed
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((d) => (
          <div
            key={d.diff_id}
            className={`border rounded-lg px-3 py-2.5 flex flex-col sm:flex-row gap-3 ${
              d.verdict === "ok" ? "border-green-500/30 bg-green-500/5" : d.verdict === "wrong" ? "border-red-500/30 bg-red-500/5" : "border-neutral-800 bg-neutral-900/40"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.kind === "MERGE" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
                  {d.kind}
                </span>
                <TierBadge tier={RANK_TO_TIER[d.best_rank] ?? null} />
                <span className="font-medium">{d.name}</span>
                <span className="text-xs text-neutral-500">{d.y0}–{d.y1}</span>
              </div>
              <div className="text-xs text-neutral-400 mb-1">
                {d.kind === "MERGE" ? "Shown today as:" : "Registry keeps apart:"}{" "}
                {d.other_side.map((n, i) => (
                  <span key={n}>
                    {i > 0 && <span className="text-neutral-600"> · </span>}
                    <span className="text-neutral-200">{n}</span>
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-neutral-500">
                Raw names: {d.raw_names.join(" · ")}
              </div>
              <div className="flex gap-2 mt-1">
                {d.competition_ids.map((id, i) => (
                  <Link key={id} href={`/competitions/c/${id}`} className="text-[11px] text-orange-400 hover:underline">
                    open{d.competition_ids.length > 1 ? ` #${i + 1}` : ""} →
                  </Link>
                ))}
              </div>
            </div>
            <VerdictButtons
              diffId={d.diff_id}
              kind={d.kind}
              competitionIds={d.competition_ids}
              rawNames={d.raw_names}
              initial={d.verdict}
              initialNote={d.note}
            />
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-neutral-500">Nothing to review here.</div>}
      </div>
    </>
  );
}

async function RawTab({ q }: { q: string }) {
  const rows = q.length >= 3 ? await lookupRawName(q) : [];
  return (
    <>
      <form className="flex gap-2 mb-4" action="/competitions">
        <input type="hidden" name="tab" value="raw" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Paste a raw event name as the source has it (3+ chars)…"
          className="flex-1 bg-neutral-900 text-sm rounded px-3 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
        />
        <button className="text-xs px-3 py-1.5 rounded bg-orange-500 text-black font-semibold">Look up</button>
      </form>
      <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden">
        {rows.map((r, i) => (
          <div key={i} className="px-3 py-2 bg-neutral-900/40 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{r.event_name}</span>
              <span className="text-xs text-neutral-500">
                {r.source} · {r.years.join(", ")}
              </span>
            </div>
            <div className="text-xs text-neutral-400 mt-0.5">
              → registry:{" "}
              <Link href={`/competitions/c/${r.competition_id}`} className="text-orange-400 hover:underline">
                {r.canonical_name}
              </Link>
              <span className="text-neutral-600"> · </span>
              rule <code className="text-neutral-300">{r.base_key}</code>
              <span className="text-neutral-600"> · </span>
              today: {r.production_series.join(" / ") || "—"}
            </div>
          </div>
        ))}
        {q.length >= 3 && rows.length === 0 && <div className="px-3 py-4 text-sm text-neutral-500">No raw name matches.</div>}
      </div>
    </>
  );
}
