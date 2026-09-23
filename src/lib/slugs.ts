import { EVENT_GROUPS } from "./events";

const ALL_EVENTS = Array.from(
  new Set(EVENT_GROUPS.flatMap((g) => [...g.events.Men, ...g.events.Women]))
);

export function eventSlug(event: string): string {
  return event.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const SLUG_TO_EVENT: Record<string, string> = Object.fromEntries(
  ALL_EVENTS.map((e) => [eventSlug(e), e])
);

export function eventFromSlug(slug: string): string | null {
  return SLUG_TO_EVENT[slug] ?? null;
}

export function allEventSlugs(): string[] {
  return ALL_EVENTS.map(eventSlug);
}
