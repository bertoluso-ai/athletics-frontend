"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_GROUPS, TIER_PRIORITY, eventLabel, sortEventsAlpha } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";
import type { Race, LatestResultGroup } from "@/lib/queries";
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

function place(city: string | null, country: string | null) {
  if (!city && !country) return null;
  return [city, country].filter(Boolean).join(", ");
}

export default function LatestResults({ initialGroups }: { initialGroups: LatestResultGroup[] }) {
  const [event, setEvent] = useState("");
  const [tier, setTier] = useState("");
  const [groups, setGroups] = useState<LatestResultGroup[]>(initialGroups);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!event && !tier) {
      setGroups(initialGroups);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (event) params.set("event", event);
    if (tier) params.set("tier", tier);
    fetch(`/api/latest-results?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setGroups(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, tier]);

  return (
    <section>
      <div className="mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="flex-1 min-w-[7rem] bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All disciplines</option>
            {sortEventsAlpha(ALL_EVENTS).map((ev) => (
              <option key={ev} value={ev}>
                {eventLabel(ev)}
              </option>
            ))}
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="flex-1 min-w-[6rem] bg-neutral-800 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All categories</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
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
          groups.map((group) => {
            const latestDate = group.races[0]?.date;
            const meetHref = `/meets/${encodeURIComponent(group.event_name)}${latestDate ? `?year=${latestDate.slice(0, 4)}` : ""}`;
            return (
              <div key={group.event_name} className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-neutral-900 border-l-4 border-l-orange-500 flex items-center justify-between gap-2">
                  <Link href={meetHref} className="text-base font-bold leading-tight hover:text-orange-400 truncate min-w-0">
                    {group.event_name}
                  </Link>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {place(group.city, group.country) && (
                      <span className="text-xs text-neutral-500">{place(group.city, group.country)}</span>
                    )}
                    {group.competition_level && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                        {group.competition_level}
                      </span>
                    )}
                  </span>
                </div>
                <div className="divide-y divide-neutral-800/60">
                  {group.races.map((race) => {
                    const raceHref = `/meets/${encodeURIComponent(group.event_name)}?${new URLSearchParams({
                      year: race.date.slice(0, 4),
                      discipline: race.athletics_event,
                      gender: race.gender,
                    }).toString()}`;
                    // Wind is per-athlete (each athlete's own best attempt),
                    // so only surface it when the whole podium agrees.
                    const raceWinds = new Set(race.top3.map((e) => e.wind).filter((w): w is string => !!w));
                    const raceWind = raceWinds.size === 1 ? [...raceWinds][0] : null;
                    return (
                    <div key={race.key}>
                      <div className="px-4 pt-1.5 pb-0.5 flex flex-wrap items-baseline gap-x-2 bg-neutral-900/70">
                        <Link href={raceHref} className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 hover:text-orange-400">
                          {eventLabel(race.athletics_event)}
                        </Link>
                        <span className="text-xs text-neutral-500">
                          {race.gender === "Men" ? "Men" : race.gender === "Women" ? "Women" : race.gender}
                        </span>
                        {race.round && <span className="text-xs text-neutral-500">· {race.round}</span>}
                        {raceWind && (
                          <span className="text-xs font-mono text-neutral-500">Wind: {raceWind}</span>
                        )}
                        <span className="text-xs text-neutral-500 ml-auto">{formatDate(race.date)}</span>
                      </div>
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
                                    {entry.athletes.map((a, ai) => (
                                      <span key={ai}>
                                        {ai > 0 && " · "}
                                        {a.athlete_id ? (
                                          <Link href={`/athletes/${a.slug ?? a.athlete_id}`} className="hover:text-orange-400">
                                            {lastName(a.display_name)}
                                          </Link>
                                        ) : (
                                          lastName(a.display_name)
                                        )}
                                      </span>
                                    ))}
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
                            href={solo.athlete_id ? `/athletes/${solo.slug ?? solo.athlete_id}` : "#"}
                            className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/40 hover:bg-neutral-800"
                          >
                            {content}
                          </Link>
                        );
                      })}
                      <Link
                        href={raceHref}
                        className="block px-4 py-1 text-[11px] text-center text-neutral-500 hover:text-orange-400 bg-neutral-900/40"
                      >
                        View full results →
                      </Link>
                    </div>
                    );
                  })}
                </div>
                {group.total_races > group.races.length && (
                  <Link
                    href={meetHref}
                    className="block px-4 py-1.5 text-xs text-center text-neutral-500 hover:text-orange-400 bg-neutral-900/70"
                  >
                    View all {group.total_races} results of this competition
                  </Link>
                )}
              </div>
            );
          })}
        {!loading && groups.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">
            No recent results.
          </div>
        )}
        {!loading && groups.length > 0 && (
          <Link
            href="/meets?view=races"
            className="text-xs text-center text-neutral-500 hover:text-orange-400 py-1"
          >
            View all → Meets
          </Link>
        )}
      </div>
    </section>
  );
}
