// Event catalog for selectors (rankings, best marks), grouped the same
// way across the site.
export const EVENT_GROUPS = [
  {
    key: "sprints", label: "Sprints",
    // 100m first: it's the event's default discipline everywhere a
    // group's own first entry is used as the initial selection (Home's
    // Athletes/Races widgets, Rankings, Disciplines...) -- 60m is indoor-
    // only and far less representative to lead with.
    events: { Men: ["100 Metres", "60 Metres", "200 Metres", "400 Metres", "150 Metres", "300 Metres", "600 Metres"], Women: ["100 Metres", "60 Metres", "200 Metres", "400 Metres", "150 Metres", "300 Metres", "600 Metres"] },
    names: { "60 Metres": "60m", "100 Metres": "100m", "200 Metres": "200m", "400 Metres": "400m", "150 Metres": "150m", "300 Metres": "300m", "600 Metres": "600m" } as Record<string, string>,
  },
  {
    key: "hurdles", label: "Hurdles",
    events: { Men: ["60 Metres Hurdles", "110 Metres Hurdles", "400 Metres Hurdles", "300 Metres Hurdles"], Women: ["60 Metres Hurdles", "100 Metres Hurdles", "400 Metres Hurdles", "300 Metres Hurdles"] },
    names: { "60 Metres Hurdles": "60mH", "110 Metres Hurdles": "110mH", "100 Metres Hurdles": "100mH", "400 Metres Hurdles": "400mH", "300 Metres Hurdles": "300mH" } as Record<string, string>,
  },
  {
    key: "middle", label: "Middle Distance",
    events: { Men: ["800 Metres", "1500 Metres", "Mile", "1000 Metres"], Women: ["800 Metres", "1500 Metres", "Mile", "1000 Metres"] },
    names: { "800 Metres": "800m", "1500 Metres": "1500m", "Mile": "Mile", "1000 Metres": "1000m" } as Record<string, string>,
  },
  {
    key: "long", label: "Long Distance",
    events: {
      Men: ["3000 Metres", "3000 Metres Steeplechase", "5000 Metres", "10000 Metres"],
      Women: ["3000 Metres", "3000 Metres Steeplechase", "5000 Metres", "10000 Metres"],
    },
    names: { "3000 Metres": "3000m", "3000 Metres Steeplechase": "3000m SC", "5000 Metres": "5000m", "10000 Metres": "10000m" } as Record<string, string>,
  },
  {
    key: "walk", label: "Race Walk",
    // Una sola grafia por distancia. World Athletics publica la misma prueba
    // con dos nombres (pista en metros: "10000 Metres Race Walk"; ruta en
    // kilometros: "10 Kilometres Race Walk") y el scraper los guardaba como
    // eventos distintos, asi que un mismo atleta salia con DOS personal
    // bests para la misma actuacion (reportado por el usuario: "10km Walk
    // 42.41" y "10.000m Walk 42:41.21" en el perfil). Ahora
    // match_incremental.sql los unifica en una athletics_event_base comun
    // (criterio de WA: < 10 km en metros, >= 10 km en kilometros), asi que
    // aqui solo puede quedar una entrada por distancia -- las grafias
    // absorbidas ("5 Kilometres Race Walk", "10000 Metres Race Walk") ya no
    // existen como base y listarlas solo ofrecia una disciplina vacia.
    events: {
      Men: [
        "3000 Metres Race Walk", "5000 Metres Race Walk", "10 Kilometres Race Walk",
        "20 Kilometres Race Walk", "35 Kilometres Race Walk", "50 Kilometres Race Walk",
        "Half Marathon Race Walk",
      ],
      Women: [
        "3000 Metres Race Walk", "5000 Metres Race Walk", "10 Kilometres Race Walk",
        "20 Kilometres Race Walk", "35 Kilometres Race Walk", "50 Kilometres Race Walk",
        "Half Marathon Race Walk",
      ],
    },
    names: {
      "3000 Metres Race Walk": "3000m Walk", "5000 Metres Race Walk": "5000m Walk",
      "10 Kilometres Race Walk": "10km Walk", "20 Kilometres Race Walk": "20km Walk",
      "35 Kilometres Race Walk": "35km Walk", "50 Kilometres Race Walk": "50km Walk",
      "Half Marathon Race Walk": "Half Marathon Walk",
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
    // "Cross Country Senior Race" era una entrada duplicada en este
    // selector: ambas comparten la misma athletics_event_base ("Cross
    // Country", ver matchAthletesIncremental/match_incremental.sql), asi
    // que las paginas de disciplinas ya agrupan sus resultados juntos --
    // mantenerla aqui aparte solo confundia (dos opciones que mostraban
    // el mismo "todas las edades" pero con listas distintas).
    //
    // Las categorias de edad SI van por separado (corregido el 2026-10-08):
    // el cross U20/U23/U18 corre recorridos mas cortos que el senior (mediana
    // de 1343s / 1517s / 1333s frente a 1898s, medido en events_enriched), asi
    // que antes, cuando el REGEXP les quitaba el sufijo de edad y las
    // fusionaba todas bajo "Cross Country", el ranking y el all-time-best
    // mezclaban distancias distintas. Ahora cada categoria tiene su propia
    // athletics_event_base y hay que ofrecerla aqui para poder consultarla.
    //
    // El corte LARGO/CORTO va aparte (2026-10-08). World Athletics publica
    // TODAS las carreras de un mismo campeonato nacional bajo un unico
    // "Men's/Women's Cross Country" con los puestos reiniciando en cada una:
    // en el campeonato polaco 2024 convivian dos carreras senior de distinta
    // distancia (5:53-8:49 y 18:44-25:32) bajo la misma athletics_event_base,
    // asi que el all-time-best de "Cross Country" salia con un 4:01.00 de una
    // carrera de ~2 km. Desde entonces el pipeline reparte esas carreras:
    // "Cross Country" es la carrera larga (la del ganador mas lento) y
    // "Cross Country Short" las demas (ver matchAthletesIncremental/
    // split_cross_country_races.sql). Las que YA venian etiquetadas por WA
    // por separado ("Cross Country Short Race" = short course de los Mundiales
    // de 1998-2006 y Europeos, "Cross Country Long Race", "Short Cross",
    // "Cross Country 4000m") estaban exportadas a serving pero eran
    // inalcanzables: sin entrada aqui, eventFromSlug() devolvia null y
    // /disciplines/<slug> daba 404 (no aparecian en el selector).
    //
    // Reagrupado por DISTANCIA (2026-10-08, matchAthletesIncremental/
    // regroup_cross_country.sql): esas etiquetas de WA significaban lo mismo
    // que otras, asi que ahora cada carrera va al grupo que le toca por el
    // tiempo de su ganador -- Cross Country (largo, ~20-40 min), Short (~4 km,
    // 9:30-17 min), Sprint (~2 km de los nacionales, 4-8:40 min) -- mas las
    // categorias de edad. Las URLs viejas redirigen (LEGACY_EVENT_ALIASES).
    events: {
      Men: [
        "Cross Country", "Cross Country Short", "Cross Country Sprint",
        "Cross Country U23", "Cross Country U20", "Cross Country U18",
      ],
      Women: [
        "Cross Country", "Cross Country Short", "Cross Country Sprint",
        "Cross Country U23", "Cross Country U20", "Cross Country U18",
      ],
    },
    names: {
      "Cross Country": "Cross Country",
      "Cross Country Short": "Cross Country Short (~4 km)",
      "Cross Country Sprint": "Cross Country Sprint (~2 km)",
      "Cross Country U23": "Cross Country U23",
      "Cross Country U20": "Cross Country U20",
      "Cross Country U18": "Cross Country U18",
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

// Disciplines that no longer exist on their own because they were folded
// into another (regroup_cross_country.sql): old /disciplines/<slug> links
// redirect to the group they now belong to instead of 404ing.
export const LEGACY_EVENT_ALIASES: Record<string, string> = {
  "Cross Country Long Race": "Cross Country",
  "Cross Country Short Race": "Cross Country Short",
  "Short Cross": "Cross Country Short",
  "Cross Country 4000m": "Cross Country Short",
};

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
  if ((FIELD_EVENTS as readonly string[]).includes(event)) return true;
  if (HIGHER_IS_BETTER_NON_FIELD.includes(event)) return true;
  // Hour races ("Hour Race Walk", "1 Hour", "One Hour", "24 Hours") are
  // scored by DISTANCE covered ("14048 m", mark_seconds NULL): higher is
  // better, read from `mark` like a field event -- treated as a time they
  // had no comparable value at all (empty meet history, unsorted lists).
  if (/\bhours?\b/i.test(event)) return true;
  // Not an exact catalog name -- likely an age/implement/round variant of
  // one ("Shot Put (5kg)", "Javelin Throw (700g)", "Discus Throw (1.500kg)",
  // "Decathlon Boys", "Heptathlon U18"). Falling back to the same keyword
  // guess eventCategory uses keeps those "higher is better / metres or
  // points", instead of the old exact-match test which treated them as a
  // time and sorted them worst-to-best (a 12.58m shot put above a 16.79m
  // one, a 5512pt decathlon above a 6888pt one).
  const category = eventCategory(event);
  return category === "Field" || category === "Combined";
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
