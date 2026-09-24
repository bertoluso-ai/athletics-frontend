"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, TIER_PRIORITY, eventLabel } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import type { Race } from "@/lib/queries";
import Flag from "./Flag";
import WindBadge from "./WindBadge";

const ALL_EVENTS = Array.from(
  new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women]))
);

const TIERS = Object.keys(TIER_PRIORITY).sort((a, b) => TIER_PRIORITY[a] - TIER_PRIORITY[b]);

const MEDAL = ["🥇", "🥈", "🥉"];

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function LatestResults({ initialRaces }: { initialRaces: Race[] }) {
  const [event, setEvent] = useState("");
  const [tier, setTier] = useState("");
  const [nationality, setNationality] = useState("");
  const [races, setRaces] = useState<Race[]>(initialRaces);
  const [nationalities, setNationalities] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Nationality options are independent of the current filters -- fetch
  // once so the dropdown is populated even before any filter is touched.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/latest-results")
      .then((r) => r.json())
      .then((data) => !cancelled && setNationalities(data.nationalities));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!event && !tier && !nationality) {
      setRaces(initialRaces);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (event) params.set("event", event);
    if (tier) params.set("tier", tier);
    if (nationality) params.set("nationality", nationality);
    fetch(`/api/latest-results?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setRaces(data.races))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, tier, nationality]);

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">
          Latest Results
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 sm:flex sm:items-center gap-2">
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="w-full sm:w-auto bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All disciplines</option>
            {ALL_EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {eventLabel(ev)}
              </option>
            ))}
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="w-full sm:w-auto bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All categories</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="w-full sm:w-auto bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All nationalities</option>
            {nationalities.map((n) => (
              <option key={n.code} value={n.code}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {loading && (
          <div className="px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">
            Loading…
          </div>
        )}
        {!loading &&
          races.map((race) => (
            <div key={race.key} className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-2 bg-neutral-900">
                <div className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/events/${eventSlug(race.athletics_event)}`} className="text-sm font-medium hover:text-orange-400 shrink-0">
                    {eventLabel(race.athletics_event)}
                  </Link>
                  <span className="text-neutral-500 shrink-0">·</span>
                  <Link
                    href={`/meets/${encodeURIComponent(race.event_name)}?year=${race.date.slice(0, 4)}&discipline=${encodeURIComponent(race.athletics_event)}&gender=${race.gender}`}
                    className="text-sm text-neutral-400 hover:text-orange-400 truncate min-w-0"
                  >
                    {race.event_name}
                  </Link>
                  {race.city && (
                    <span className="text-xs text-neutral-500 shrink-0">
                      {race.city}{race.country ? `, ${race.country}` : ""}
                    </span>
                  )}
                  <span className="text-xs text-neutral-500 shrink-0">
                    {race.gender === "Men" ? "Men" : race.gender === "Women" ? "Women" : race.gender}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {race.top3.find((e) => e.wind)?.wind && (
                    <span className="text-xs font-mono text-neutral-500">
                      Wind: {race.top3.find((e) => e.wind)!.wind}
                    </span>
                  )}
                  {race.competition_level && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                      {race.competition_level}
                    </span>
                  )}
                  <span className="text-xs text-neutral-500">{formatDate(race.date)}</span>
                </div>
              </div>
              <div className="divide-y divide-neutral-800/60">
                {race.top3.map((entry, i) => {
                  const isTeam = entry.athletes.length > 1;
                  const solo = entry.athletes[0];
                  const content = (
                    <>
                      <span className="text-sm flex items-center gap-2 min-w-0">
                        <span className="w-5 text-center shrink-0">{MEDAL[entry.place - 1] ?? entry.place}</span>
                        <Flag code={entry.nationality} />
                        {isTeam ? (
                          <span className="truncate">
                            {entry.nationality ?? "—"}
                            <span className="text-neutral-500 font-normal ml-2 text-xs">
                              {entry.athletes.map((a) => lastName(a.display_name)).join(" · ")}
                            </span>
                          </span>
                        ) : (
                          <span className="truncate">{solo.display_name}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {entry.record === "WR" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">
                            WR
                          </span>
                        )}
                        <WindBadge wind={entry.wind} windLegal={entry.wind_legal} />
                        <span className="font-mono text-sm text-neutral-300">{entry.mark_display}</span>
                      </span>
                    </>
                  );
                  if (isTeam) {
                    return (
                      <div key={i} className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/40">
                        {content}
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={i}
                      href={solo.athlete_id ? `/athletes/${solo.athlete_id}` : "#"}
                      className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/40 hover:bg-neutral-800"
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        {!loading && races.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">
            No recent results.
          </div>
        )}
      </div>
    </section>
  );
}
