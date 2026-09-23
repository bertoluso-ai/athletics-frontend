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
    events: { Men: ["5000 Metres", "10000 Metres"], Women: ["5000 Metres", "10000 Metres"] },
    names: { "5000 Metres": "5000m", "10000 Metres": "10,000m" } as Record<string, string>,
  },
  {
    key: "walk", label: "Race Walk",
    events: { Men: ["20 Kilometres Race Walk", "35 Kilometres Race Walk"], Women: ["20 Kilometres Race Walk", "35 Kilometres Race Walk"] },
    names: { "20 Kilometres Race Walk": "20km Walk", "35 Kilometres Race Walk": "35km Walk" } as Record<string, string>,
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
    events: { Men: ["Decathlon"], Women: ["Heptathlon"] },
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

// Field events are measured in metres (higher/farther is better); everything
// else is a time (lower is better) -- used to pick sort direction for marks.
export const FIELD_EVENTS = [
  "Long Jump", "High Jump", "Triple Jump", "Pole Vault",
  "Shot Put", "Discus Throw", "Javelin Throw", "Hammer Throw",
];

export function isFieldEvent(event: string): boolean {
  return (FIELD_EVENTS as readonly string[]).includes(event);
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
