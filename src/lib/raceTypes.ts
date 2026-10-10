// Kind of race, by what is run (not just where). One definition shared by the
// Home widgets, Meets, Rankings and Disciplines:
//   indoor  -> any race of an indoor meet
//   track   -> outdoor track and field (everything that is none of the below)
//   road    -> road running (marathon, half, 10k, 5k, 10 miles...)
//   cross   -> cross country (all its groups)
//   walk    -> race walking (it is run on track and on road)
//   trail   -> mountain and trail running
// Classification is by the discipline name (athletics_event_base), the same
// regex in SQL (below) and in JS (eventRaceKind) so list and filter agree.

export type RaceType = "track" | "indoor" | "road" | "cross" | "walk" | "trail";

export const RACE_TYPES: { value: RaceType; label: string }[] = [
  { value: "track", label: "Track" },
  { value: "indoor", label: "Indoor" },
  { value: "road", label: "Road" },
  { value: "cross", label: "Cross country" },
  { value: "walk", label: "Race walk" },
  { value: "trail", label: "Mountain & trail" },
];

export function isRaceType(v: unknown): v is RaceType {
  return typeof v === "string" && RACE_TYPES.some((t) => t.value === v);
}

const SPECIAL = /(road|marathon|cross|walk|mountain|trail|off-road)/i;

// Kind of a discipline by name (never "indoor": that depends on the meet, not the discipline).
export function eventRaceKind(ev: string): Exclude<RaceType, "indoor"> {
  if (/walk/i.test(ev)) return "walk";
  if (/cross country/i.test(ev)) return "cross";
  if (/(mountain|trail|off-road)/i.test(ev)) return "trail";
  if (/(road|marathon)/i.test(ev)) return "road";
  return "track";
}

// Does a discipline belong in the list for this type? Indoor lists every
// discipline that can be run indoors (all but road, cross, walk-on-road, trail).
export function eventMatchesType(ev: string, type: RaceType): boolean {
  const kind = eventRaceKind(ev);
  if (type === "indoor") return kind === "track" || kind === "walk";
  return kind === type;
}

// SQL condition for a type. `base` = the column holding the discipline name,
// `indoor` = an expression that is true for indoor races.
export function raceTypeSql(type: RaceType, base: string, indoor: string): string {
  switch (type) {
    case "indoor":
      return `(${indoor})`;
    case "track":
      return `(NOT (${indoor}) AND ${base} !~* '${SPECIAL.source}')`;
    case "road":
      return `(${base} ~* '(road|marathon)' AND ${base} !~* 'walk')`;
    case "cross":
      return `(${base} ILIKE 'cross country%')`;
    case "walk":
      return `(${base} ILIKE '%walk%')`;
    case "trail":
      return `(${base} ~* '(mountain|trail|off-road)')`;
  }
}
