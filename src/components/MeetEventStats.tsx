import Link from "next/link";
import Flag from "./Flag";
import { eventLabel } from "@/lib/events";
import { getMeetEventStats } from "@/lib/meetStats";
import { getAthletePhotoInfo, photoCredit } from "@/lib/wikipedia";
import PhotoCreditsToast from "./PhotoCreditsToast";

// Right-hand column of the meet page: the history of one event (discipline
// + gender) at this meet series.

function Title({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5" title={hint}>
      {children}
    </h3>
  );
}

export default async function MeetEventStats({
  eventName,
  event,
  gender,
  genders,
  genderHref,
}: {
  eventName: string;
  event: string;
  gender: string;
  genders: string[];
  genderHref: (g: string) => string;
}) {
  const s = await getMeetEventStats(eventName, event, gender);
  // record holder's photo (not for relays: that's a team)
  const recordPhoto =
    s.meetRecord && !s.relay && s.meetRecord.display_name ? await getAthletePhotoInfo(s.meetRecord.display_name) : null;
  const person = (id: string | null, name: string | null, nat: string | null) => (
    <span className="flex items-center gap-1.5 min-w-0">
      <Flag code={nat} />
      {s.relay || !id ? (
        <span className="truncate">{s.relay ? nat : name}</span>
      ) : (
        <Link href={`/athletes/${id}`} className="truncate hover:text-orange-400">
          {name}
        </Link>
      )}
    </span>
  );

  return (
    <aside className="flex flex-col gap-5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
          {eventLabel(event)} <span className="text-neutral-500">at this meet</span>
        </h2>
        {genders.length > 1 && (
          <div className="flex rounded bg-neutral-800 p-0.5 text-[11px]">
            {genders.map((g) => (
              <Link
                key={g}
                href={genderHref(g)}
                scroll={false}
                className={`px-2 py-0.5 rounded ${g === gender ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
              >
                {g === "Men" ? "M" : g === "Women" ? "W" : g}
              </Link>
            ))}
          </div>
        )}
      </div>

      {s.meetRecord && (
        <section className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2">
          <Title hint="Best wind-legal mark ever at this meet in this event">Meet record</Title>
          <div className="flex items-stretch gap-3">
            {recordPhoto && (
              <Link
                href={s.meetRecord.athlete_id ? `/athletes/${s.meetRecord.athlete_id}` : "#"}
                className="relative w-16 shrink-0 rounded-md overflow-hidden border border-neutral-800 bg-neutral-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={recordPhoto.url} alt={s.meetRecord.display_name ?? ""} title={photoCredit(recordPhoto)} className="absolute inset-0 w-full h-full object-cover" />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-lg font-bold text-orange-400">{s.meetRecord.mark_display}</span>
                <span className="text-xs text-neutral-500">{s.meetRecord.year}</span>
              </div>
              {person(s.meetRecord.athlete_id, s.meetRecord.display_name, s.meetRecord.nationality)}
              {s.meetRecord.all_time_rank && (
                <div className="text-[11px] text-neutral-500 mt-0.5">#{s.meetRecord.all_time_rank} performance of all time</div>
              )}
            </div>
          </div>
        </section>
      )}

      {s.wrs.length > 0 && (
        <section>
          <Title hint="Marks at this meet that bettered (or equalled) every earlier legal mark we know of, from 1983 on">
            World records set here
          </Title>
          <div className="flex flex-col gap-1">
            {s.wrs.map((w, i) => (
              <div key={i} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-2">
                <span className="text-xs text-neutral-500">{w.year}</span>
                {person(w.athlete_id, w.display_name, w.nationality)}
                <span className="font-mono text-xs font-bold text-yellow-400">{w.mark_display} WR</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.allTimeHere.length > 0 && (
        <section>
          <Title hint="Performances at this meet among the 100 best ever in this event (same indoor/outdoor kind)">
            All-time top-100 marks set here
          </Title>
          <div className="flex flex-col gap-1">
            {s.allTimeHere.slice(0, 6).map((r, i) => (
              <div key={i} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-2">
                <span className="text-xs text-neutral-500 tabular-nums">#{r.all_time_rank}</span>
                {person(r.athlete_id, r.display_name, r.nationality)}
                <span className="font-mono text-xs text-neutral-300">
                  {r.mark_display} <span className="text-neutral-600">&apos;{String(r.year).slice(2)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.topAthletes.length > 0 && (
        <section>
          <Title>{s.relay ? "Most wins (teams)" : "Most wins"}</Title>
          <div className="flex flex-col gap-1">
            {s.topAthletes.map((a) => {
              const w = s.winners.find((x) => (s.relay ? x.nationality : x.athlete_id ?? x.display_name) === a.key);
              return (
                <div key={a.key} className="grid grid-cols-[1fr_auto] items-center gap-x-2">
                  {person(w?.athlete_id ?? null, a.name, a.nationality)}
                  <span className="text-xs text-neutral-300 tabular-nums">🥇 {a.wins}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {s.topCountries.length > 0 && (
        <section>
          <Title>Wins by country</Title>
          <div className="flex flex-wrap gap-1.5">
            {s.topCountries.map((c) => (
              <Link
                key={c.key}
                href={`/countries/${c.key}`}
                className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-xs hover:border-neutral-600"
              >
                <Flag code={c.nationality} /> {c.key} <span className="text-orange-400 font-mono">{c.wins}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {s.winners.length > 0 && (
        <section>
          <Title>Winners</Title>
          <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 overflow-hidden max-h-[22rem] overflow-y-auto">
            {s.winners.map((w) => (
              <div key={w.year} className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-2 px-2.5 py-1.5 bg-neutral-900/40">
                <Link href={`/meets/${encodeURIComponent(eventName)}?year=${w.year}&discipline=${encodeURIComponent(event)}&gender=${gender}`} className="text-xs text-neutral-400 hover:text-orange-400">
                  {w.year}
                </Link>
                {person(w.athlete_id, w.display_name, w.nationality)}
                <span className="font-mono text-xs text-neutral-300">{w.mark_display}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.winners.length === 0 && !s.meetRecord && <p className="text-xs text-neutral-500">No history for this event yet.</p>}
      {recordPhoto && s.meetRecord && (
        <div className="-mx-3 sm:-mx-6">
          <PhotoCreditsToast items={[{ who: s.meetRecord.display_name ?? "", credit: photoCredit(recordPhoto), url: recordPhoto.sourceUrl }]} />
        </div>
      )}
    </aside>
  );
}
