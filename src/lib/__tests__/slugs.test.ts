import { describe, expect, it } from "vitest";
import { EVENT_GROUPS, groupEvents } from "../events";
import { allEventSlugs, eventFromSlug, eventSlug } from "../slugs";

const ALL = Array.from(new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women, ...groupEvents(g, "Mixed")])));

describe("eventSlug", () => {
  it("normaliza a minusculas con guiones", () => {
    expect(eventSlug("2000 Metres Steeplechase")).toBe("2000-metres-steeplechase");
    expect(eventSlug("  Half Marathon! ")).toBe("half-marathon");
  });
});

describe("catalogo de disciplinas", () => {
  it("dos disciplinas distintas nunca comparten slug (sino una pagina pisa a la otra)", () => {
    const slugs = ALL.map(eventSlug);
    const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(dup).toEqual([]);
  });
  it("ida y vuelta: eventFromSlug(eventSlug(e)) === e", () => {
    for (const e of ALL) expect(eventFromSlug(eventSlug(e))).toBe(e);
  });
  it("incluye los relevos mixtos y allEventSlugs coincide con el catalogo", () => {
    expect(allEventSlugs().length).toBe(ALL.length);
    expect(eventFromSlug("sprint-medley-relay-1000m")).not.toBeNull();
  });
  it("slug desconocido -> null", () => expect(eventFromSlug("no-existe")).toBeNull());
});
