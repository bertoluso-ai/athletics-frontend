import { describe, expect, it } from "vitest";
import {
  EVENT_GROUPS, LEGACY_EVENT_ALIASES, eventCategory, eventLabel, groupEvents, isFieldEvent, isRelayEvent, isWindAffected,
  tierPriority, tierScore,
} from "../events";

describe("isFieldEvent (mayor es mejor: va por marca, no por tiempo)", () => {
  it.each(["Shot Put", "Long Jump", "Decathlon", "Heptathlon", "Pole Vault"])("%s", (e) => expect(isFieldEvent(e)).toBe(true));
  // regresion real: variantes por edad/implemento se trataban como tiempo y se ordenaban de peor a mejor
  it.each(["Shot Put (5kg)", "Javelin Throw (700g)", "Discus Throw (1.500kg)", "Decathlon Boys", "Heptathlon U18", "24 Hours", "Hour Race Walk"])(
    "variante %s", (e) => expect(isFieldEvent(e)).toBe(true));
  it.each(["100 Metres", "Marathon", "110 Metres Hurdles", "4x100 Metres Relay"])("%s es de tiempo", (e) => expect(isFieldEvent(e)).toBe(false));
});

describe("eventCategory", () => {
  it.each([
    ["Javelin Throw (500g)", "Field"], ["Heptathlon U18", "Combined"], ["20 Kilometres Race Walk", "Race Walk"],
    ["Mountain Running", "Trail"], ["Marathon", "Road"], ["10 Kilometres", "Road"], ["4x400 Metres Relay", "Relays"],
    ["Cross Country", "Cross Country"], ["100 Metres", "Track"],
  ])("%s -> %s", (e, c) => expect(eventCategory(e)).toBe(c));
  it("10km de ruta no se confunde con 10000m de pista", () => {
    expect(eventCategory("10 Kilometres")).toBe("Road");
    expect(eventCategory("10000 Metres")).toBe("Track");
  });
});

describe("relevos, viento", () => {
  it("isRelayEvent", () => {
    expect(isRelayEvent("4x100 Metres Relay")).toBe(true);
    expect(isRelayEvent("100 Metres")).toBe(false);
  });
  it("isWindAffected solo en pruebas con viento", () => {
    expect(isWindAffected("100 Metres")).toBe(true);
    expect(isWindAffected("400 Metres")).toBe(false);
  });
});

describe("tiers de competicion", () => {
  it("prioridad: OW la mas importante, sin tier al final", () => {
    expect(tierPriority("OW")).toBeLessThan(tierPriority("DF"));
    expect(tierPriority("A")).toBeLessThan(tierPriority("F"));
    expect(tierPriority(null)).toBe(99);
    expect(tierPriority("??")).toBe(50);
  });
  it("tierScore en 0..100, OW = 100, sin tier = 0", () => {
    expect(tierScore("OW")).toBe(100);
    expect(tierScore(null)).toBe(0);
    expect(tierScore("F")).toBeGreaterThan(0);
    expect(tierScore("F")).toBeLessThan(tierScore("A"));
  });
});

describe("catalogo", () => {
  it("las equivalencias antiguas apuntan a disciplinas que existen", () => {
    const all = new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women, ...groupEvents(g, "Mixed")]));
    for (const target of Object.values(LEGACY_EVENT_ALIASES)) expect(all.has(target)).toBe(true);
  });
  it("Mixed solo existe en relevos", () => {
    for (const g of EVENT_GROUPS) if (g.key !== "relays") expect(groupEvents(g, "Mixed")).toEqual([]);
  });
  it("eventLabel de un nombre desconocido devuelve el mismo nombre", () => expect(eventLabel("Algo Raro")).toBe("Algo Raro"));
});
