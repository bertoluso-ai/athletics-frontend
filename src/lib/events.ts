// Event catalog for selectors (rankings, best marks), grouped the same
// way across the site.
export const EVENT_GROUPS = [
  {
    key: "sprints", label: "Sprints",
    events: { Men: ["100 Metres", "200 Metres", "400 Metres"], Women: ["100 Metres", "200 Metres", "400 Metres"] },
    names: { "100 Metres": "100m", "200 Metres": "200m", "400 Metres": "400m" } as Record<string, string>,
  },
  {
    key: "hurdles", label: "Hurdles",
    events: { Men: ["110 Metres Hurdles", "400 Metres Hurdles"], Women: ["100 Metres Hurdles", "400 Metres Hurdles"] },
    names: { "110 Metres Hurdles": "110mH", "100 Metres Hurdles": "100mH", "400 Metres Hurdles": "400mH" } as Record<string, string>,
  },
  {
    key: "middle", label: "Middle Distance",
    events: { Men: ["800 Metres", "1500 Metres"], Women: ["800 Metres", "1500 Metres"] },
    names: { "800 Metres": "800m", "1500 Metres": "1500m" } as Record<string, string>,
  },
  {
    key: "long", label: "Long Distance",
    events: { Men: ["3000 Metres", "5000 Metres", "10000 Metres"], Women: ["3000 Metres", "5000 Metres", "10000 Metres"] },
    names: { "3000 Metres": "3000m", "5000 Metres": "5000m", "10000 Metres": "10000m" } as Record<string, string>,
  },
  {
    key: "walk", label: "Race Walk",
    events: {
      Men: [
        "3000 Metres Race Walk", "5 Kilometres Race Walk", "5000 Metres Race Walk",
        "10 Kilometres Race Walk", "10000 Metres Race Walk", "Half Marathon Race Walk",
        "20 Kilometres Race Walk", "35 Kilometres Race Walk", "50 Kilometres Race Walk",
      ],
      Women: [
        "3000 Metres Race Walk", "5 Kilometres Race Walk", "5000 Metres Race Walk",
        "10 Kilometres Race Walk", "10000 Metres Race Walk", "Half Marathon Race Walk",
        "20 Kilometres Race Walk", "35 Kilometres Race Walk", "50 Kilometres Race Walk",
      ],
    },
    names: {
      "3000 Metres Race Walk": "3000m Walk", "5 Kilometres Race Walk": "5km Walk",
      "5000 Metres Race Walk": "5000m Walk", "10 Kilometres Race Walk": "10km Walk",
      "10000 Metres Race Walk": "10,000m Walk", "Half Marathon Race Walk": "Half Marathon Walk",
      "20 Kilometres Race Walk": "20km Walk", "35 Kilometres Race Walk": "35km Walk",
      "50 Kilometres Race Walk": "50km Walk",
    } as Record<string, string>,
  },
  {
    key: "jumps", label: "Jumps",
    events: { Men: ["Long Jump", "High Jump", "Triple Jump", "Pole Vault"], Women: ["Long Jump", "High Jump", "Triple Jump", "Pole Vault"] },
    names: { "Long Jump": "Long Jump", "High Jump": "High Jump", "Triple Jump": "Triple Jump", "Pole Vault": "Pole Vault" } as Record<string, string>,
  },
  {
    key: "throws", label: "Throws",
    events: { Men: ["Shot Put", "Discus Throw", "Javelin Throw", "Hammer Throw"], Women: ["Shot Put", "Discus Throw", "Javelin Throw", "Hammer Throw"] },
    names: { "Shot Put": "Shot Put", "Discus Throw": "Discus", "Javelin Throw": "Javelin", "Hammer Throw": "Hammer" } as Record<string, string>,
  },
  {
    key: "combined", label: "Combined Events",
    // Men's Heptathlon is the standard indoor combined event for men (real,
    // not a data error -- thousands of results), so it's offered alongside
    // Decathlon rather than only under Women.
    events: { Men: ["Decathlon", "Heptathlon"], Women: ["Heptathlon"] },
    names: { Decathlon: "Decathlon", Heptathlon: "Heptathlon" } as Record<string, string>,
  },
  {
    key: "road", label: "Road",
    events: {
      Men: ["Marathon", "Half Marathon", "10 Kilometres Road", "5 Kilometres Road"],
      Women: ["Marathon", "Half Marathon", "10 Kilometres Road", "5 Kilometres Road"],
    },
    names: {
      Marathon: "Marathon", "Half Marathon": "Half Marathon",
      "10 Kilometres Road": "10km", "5 Kilometres Road": "5km",
    } as Record<string, string>,
  },
  {
    key: "cross", label: "Cross Country",
    events: {
      Men: ["Cross Country", "Cross Country Senior Race"],
      Women: ["Cross Country", "Cross Country Senior Race"],
    },
    names: {
      "Cross Country": "Cross Country", "Cross Country Senior Race": "Cross Country Senior Race",
    } as Record<string, string>,
  },
  {
    key: "relays", label: "Relays",
    events: {
      Men: ["4x100 Metres Relay", "4x200 Metres Relay", "4x400 Metres Relay"],
      Women: ["4x100 Metres Relay", "4x200 Metres Relay", "4x400 Metres Relay"],
    },
    names: {
      "4x100 Metres Relay": "4x100m", "4x200 Metres Relay": "4x200m", "4x400 Metres Relay": "4x400m",
    } as Record<string, string>,
  },
] as const;

export function eventLabel(ev: string): string {
  for (const g of EVENT_GROUPS) {
    if (ev in g.names) return g.names[ev as keyof typeof g.names];
  }
  return ev;
}

// Competition tier priority order: lower = more important.
export const TIER_PRIORITY: Record<string, number> = {
  OW: 0, DF: 1, GW: 2, GL: 3, A: 4, B: 5, C: 6, D: 7, E: 8, F: 9,
};

export function tierPriority(tier: string | null | undefined): number {
  if (!tier) return 99;
  return TIER_PRIORITY[tier] ?? 50;
}

// Human-readable label per tier code, ordered highest to lowest (same
// order as TIER_PRIORITY) -- for the Competitions browser's tier filter.
export const TIER_LABELS: { value: string; label: string }[] = [
  { value: "OW", label: "Olympics / World Championships" },
  { value: "DF", label: "Diamond League Final" },
  { value: "GW", label: "World-level Championships" },
  { value: "GL", label: "Continental Championships" },
  { value: "A", label: "Tier A" },
  { value: "B", label: "Tier B" },
  { value: "C", label: "Tier C" },
  { value: "D", label: "Tier D" },
  { value: "E", label: "Tier E" },
  { value: "F", label: "Tier F" },
];

// Field events are measured in metres (higher/farther is better); everything
// else is a time (lower is better) -- used to pick sort direction for marks.
export const FIELD_EVENTS = [
  "Long Jump", "High Jump", "Triple Jump", "Pole Vault",
  "Shot Put", "Discus Throw", "Javelin Throw", "Hammer Throw",
];

// Combined events score a total (higher is better) stored in the same
// `mark` field as field events, not a time in `mark_seconds` -- every call
// site that branches on isFieldEvent needs the same "higher is better, use
// mark not mark_seconds" treatment for these, even though they're not
// field events in the athletics sense (they get their own category
// elsewhere, e.g. eventCategory()).
const HIGHER_IS_BETTER_NON_FIELD = ["Decathlon", "Heptathlon", "Pentathlon"];

export function isFieldEvent(event: string): boolean {
  return (FIELD_EVENTS as readonly string[]).includes(event) || HIGHER_IS_BETTER_NON_FIELD.includes(event);
}

export function isRelayEvent(event: string): boolean {
  return event.toLowerCase().includes("relay");
}

// Disciplines where wind reading determines whether a mark counts as a
// legitimate record/ranking mark.
export const WIND_AFFECTED_EVENTS = [
  "100 Metres", "200 Metres", "110 Metres Hurdles", "100 Metres Hurdles",
  "Long Jump", "Triple Jump",
];

export function isWindAffected(event: string): boolean {
  return (WIND_AFFECTED_EVENTS as readonly string[]).includes(event);
}

const GROUP_KEY_TO_CATEGORY: Record<string, string> = {
  sprints: "Track", hurdles: "Track", middle: "Track", long: "Track",
  walk: "Race Walk", jumps: "Field", throws: "Field",
  combined: "Combined", road: "Road", cross: "Cross Country", relays: "Relays",
};

// Broad category for grouping/filtering an athlete's Personal Bests --
// finer-grained than EVENT_GROUPS (which splits track further, for
// selector UIs) but coarse enough to tell road/cross/track apart at a
// glance, which is what's easy to conflate (e.g. 10km Road vs 10,000m track).
export function eventCategory(event: string): string {
  for (const g of EVENT_GROUPS) {
    if (event in g.names) return GROUP_KEY_TO_CATEGORY[g.key] ?? "Track";
  }
  // Falls through here for variants not in the exact-name catalog --
  // youth/weight variants ("Javelin Throw (500g)", "Shot Put (3kg)"),
  // age-qualified combined events ("Heptathlon U18"), etc. Defaulting
  // those straight to "Track" was the bug: a javelin or a heptathlon
  // isn't track just because its exact string wasn't recognized. Guess
  // from keywords in the name instead, checking the more specific
  // categories before the generic "contains a throw/jump word" one.
  const lower = event.toLowerCase();
  if (/heptathlon|pentathlon|decathlon|octathlon/.test(lower)) return "Combined";
  if (/walk/.test(lower)) return "Race Walk";
  if (/cross country/.test(lower)) return "Cross Country";
  if (/relay/.test(lower)) return "Relays";
  if (/marathon|\d+\s*(kilometres|kilometers|km)\b/.test(lower)) return "Road";
  if (/jump|vault|shot put|discus|javelin|hammer|throw/.test(lower)) return "Field";
  return "Track";
}
