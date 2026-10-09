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

function dayLabel(iso: string) {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day(new Date()) - Date.parse(iso + "T00:00:00Z")) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return `· ${formatDate(iso)}`;
}

function place(city: string | null, country: string | null) {
  if (!city && !country) return null;
  return [city, country].filter(Boolean).join(", ");
}

export default function LatestResults({
  initialGroups,
  heading,
  showFilters = true,
  defaultTier = "",
  maxGroups = 99,
  exclude = [],
}: {
  initialGroups: LatestResultGroup[];
  heading?: string;
  showFilters?: boolean;
  defaultTier?: string; // tier filter the list opens with (initialGroups already match it)
  maxGroups?: number; // at most this many competitions are shown
  exclude?: string[]; // competitions shown elsewhere on the page
}) {
  const [event, setEvent] = useState("");
  const [tier, setTier] = useState(defaultTier);
  const [groups, setGroups] = useState<LatestResultGroup[]>(initialGroups);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!event && tier === defaultTier) {
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

  const shown = groups.filter((g) => !exclude.includes(g.event_name)).slice(0, maxGroups);

  return (
    <section>
      {showFilters && !loading && shown.length > 0 && shown[0].races[0] && (
        <h2 className="bg-tint text-neutral-100 text-[11px] font-extrabold uppercase tracking-wider px-3 sm:px-4 py-2 rounded-lg mb-3" suppressHydrationWarning>
          Last athletics results {dayLabel(shown[0].races[0].date)}
        </h2>
      )}
      <div className={showFilters ? "mb-3" : "hidden"}>
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
            {defaultTier && <option value={defaultTier}>B and above</option>}
            <option value="">All categories</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {loading && (
          <div className="px-3 sm:px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">
            Loading…
          </div>
        )}
        {!loading &&
          shown.map((group, gi) => {
            const latestDate = group.races[0]?.date;
            const label = latestDate ? dayLabel(latestDate) : "";
            const prevDate = gi > 0 ? shown[gi - 1].races[0]?.date : undefined;
            const newDay = heading ? gi === 0 : gi === 0 || (prevDate ? dayLabel(prevDate) : "") !== label;
            const meetHref = `/meets/${encodeURIComponent(group.event_name)}${latestDate ? `?year=${latestDate.slice(0, 4)}` : ""}`;
            return (
              <div key={group.event_name} className={gi >= 4 ? "hidden lg:block" : ""}>
                {newDay && (heading || label) && !(gi === 0 && showFilters) && (
                  <h2 className={`bg-tint text-neutral-100 text-[11px] font-extrabold uppercase tracking-wider px-3 sm:px-4 py-2 rounded-lg mb-3 ${gi > 0 ? "mt-4" : ""}`} suppressHydrationWarning>
                    {heading ?? `Last athletics results ${label}`}
                  </h2>
                )}
                <div className="border border-neutral-800 rounded-xl overflow-hidden shadow-sm bg-neutral-950">
                  <div className="px-3 sm:px-4 pt-3 pb-2.5 bg-neutral-900 border-l-4 border-l-orange-500">
                    <Link href={meetHref} className="block text-base font-bold leading-snug hover:text-orange-400">
                      {group.event_name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      {place(group.city, group.country) && <span className="truncate">{place(group.city, group.country)}</span>}
                      {group.competition_level && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-orange-400">
                          {group.competition_level}
                        </span>
                      )}
                    </div>
                  </div>
                  {group.races.map((race, ri) => {
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
                      <div key={race.key} className={`border-t border-neutral-800 ${ri >= 2 && !heading ? "hidden lg:block" : ""}`}>
                        <div className="px-3 sm:px-4 pt-3 pb-1 flex flex-wrap items-baseline gap-x-2">
                          <Link href={raceHref} className="text-xs font-bold uppercase tracking-wide text-orange-400 hover:underline">
                            {eventLabel(race.athletics_event)}
                          </Link>
                          <span className="text-xs text-neutral-500">
                            {race.gender}
                            {race.round ? ` · ${race.round}` : ""}
                          </span>
                          {raceWind && <span className="text-xs font-mono text-neutral-500">Wind: {raceWind}</span>}
                          <span className="text-xs text-neutral-500 ml-auto">{formatDate(race.date)}</span>
                        </div>
                        {race.top3.map((entry, i) => {
                          const isTeam = entry.athletes.length > 1;
                          const solo = entry.athletes[0];
                          const content = (
                            <>
                              <span className="text-sm flex items-center gap-3 min-w-0">
                                <span
                                  className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${
                                    entry.place === 1 ? "bg-orange-100 text-orange-700" : "bg-neutral-800 text-neutral-400"
                                  }`}
                                >
                                  {entry.place}
                                </span>
                                <Flag code={entry.nationality} />
                                {isTeam ? (
                                  <span className="truncate font-medium">
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
                                  <span className="truncate font-medium">{solo.display_name}</span>
                                )}
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                {entry.record === "WR" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-400 text-black">WR</span>
                                )}
                                <WindBadge wind={entry.wind} windLegal={entry.wind_legal} />
                                <span className="font-mono text-sm text-neutral-300">{entry.mark_display}</span>
                              </span>
                            </>
                          );
                          if (isTeam) {
                            return (
                              <div key={i} className="flex items-center justify-between px-3 sm:px-4 py-2">
                                {content}
                              </div>
                            );
                          }
                          return (
                            <Link
                              key={i}
                              href={solo.athlete_id ? `/athletes/${solo.slug ?? solo.athlete_id}` : "#"}
                              className="flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-neutral-900"
                            >
                              {content}
                            </Link>
                          );
                        })}
                        <Link
                          href={raceHref}
                          className="inline-block mx-3 sm:mx-4 mt-1 mb-3 text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded border border-neutral-700 text-neutral-500 hover:text-orange-400 hover:border-orange-500"
                        >
                          View results
                        </Link>
                      </div>
                    );
                  })}
                  {group.total_races > group.races.length && (
                    <Link
                      href={meetHref}
                      className="block px-3 sm:px-4 py-2 text-xs text-center text-neutral-500 hover:text-orange-400 bg-neutral-900 border-t border-neutral-800"
                    >
                      View all {group.total_races} results of this competition
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        {!loading && shown.length === 0 && (
          <div className="px-3 sm:px-4 py-6 text-sm text-neutral-500 border border-neutral-800 rounded-lg">
            No recent results.
          </div>
        )}
        {!loading && shown.length > 0 && showFilters && (
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
