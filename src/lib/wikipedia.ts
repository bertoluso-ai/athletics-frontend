import { cache } from "react";
import { pgQuery } from "./pg";

// Athlete photos from free sources only (Wikimedia Commons), with the
// author/licence credit that those licences require. The resolved result
// (including "no photo found") is written through to Postgres'
// athlete_photos table, keyed by (name, birth_year) -- the same inputs
// this function already takes, so every call site keeps working
// unchanged. Confirmed live as the dominant remaining cost on
// Rankings/Countries even after precomputing their own data (2026-10-03):
// every page load re-ran the live Wikipedia/Wikidata/Commons chain for
// the same handful of popular athletes, every time, with nothing
// persisting the answer across requests the way the SQL-level caching
// does. athlete_photos is managed by the app itself at request time, not
// by the daily BigQuery pipeline -- it's deliberately left out of
// export_to_postgres.py's TABLES so the nightly export never wipes it.
//
// Lookup order (only on a cache miss):
//   1. English Wikipedia article (search by name) -> its lead image, used
//      only if the file lives on Commons (non-free "fair use" uploads that
//      exist only on en.wikipedia are skipped).
//   2. Wikidata (covers many athletes without an English article) -> the
//      entity's image (P18), which is always a Commons file.
//
// Homonyms ("David Garcia", "Marta Perez"...): a candidate is accepted only
// if its description/extract reads as an athletics athlete and, when we
// know the athlete's birth year, the Wikidata birth year (P569) matches.

// Wikimedia asks API clients for an identifying User-Agent and throttles
// anonymous bursts.
const DAY = {
  next: { revalidate: 60 * 60 * 24 },
  headers: { "User-Agent": "athleticsinforanking.com photo lookup (https://athleticsinforanking.com)" },
};

const ATHLETICS_KEYWORDS = [
  "athlet", "sprint", "hurdl", "javelin", "discus", "shot put", "shot putter", "hammer throw",
  "long jump", "high jump", "pole vault", "triple jump", "marathon", "race walk",
  "track and field", "middle-distance", "long-distance", "decathlete", "heptathlete",
  "relay", "runner", "jumper", "thrower", "vaulter", "steeplechase",
];

function looksLikeAthlete(text: string | undefined) {
  const t = (text ?? "").toLowerCase();
  return ATHLETICS_KEYWORDS.some((kw) => t.includes(kw));
}

export type AthletePhoto = {
  url: string;
  author: string | null;
  license: string | null;
  sourceUrl: string; // Commons file page, where the full credit lives
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, DAY);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function stripHtml(s: string | undefined) {
  if (!s) return null;
  const text = s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text || null;
}

// Commons file -> thumbnail + credit. Null if the file isn't on Commons.
async function commonsFile(fileName: string): Promise<AthletePhoto | null> {
  type R = {
    query?: {
      pages?: Record<string, {
        missing?: string;
        imageinfo?: {
          thumburl?: string;
          descriptionurl?: string;
          extmetadata?: { Artist?: { value?: string }; LicenseShortName?: { value?: string } };
        }[];
      }>;
    };
  };
  const title = fileName.startsWith("File:") ? fileName : `File:${fileName}`;
  const data = await getJson<R>(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*`
  );
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : undefined;
  const info = page && page.missing === undefined ? page.imageinfo?.[0] : undefined;
  if (!info?.thumburl || !info.descriptionurl) return null;
  return {
    url: info.thumburl,
    author: stripHtml(info.extmetadata?.Artist?.value),
    license: stripHtml(info.extmetadata?.LicenseShortName?.value),
    sourceUrl: info.descriptionurl,
  };
}

// 1. English Wikipedia lead image (only if it's a Commons file)
async function fromWikipedia(name: string): Promise<AthletePhoto | null> {
  const search = await getJson<[string, string[]]>(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=1&namespace=0&format=json&origin=*`
  );
  const title = search?.[1]?.[0];
  if (!title) return null;
  type R = { query?: { pages?: Record<string, { pageimage?: string; extract?: string }> } };
  const data = await getJson<R>(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
      `&prop=pageimages|extracts&piprop=name&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`
  );
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : undefined;
  if (!page?.pageimage || !looksLikeAthlete(page.extract)) return null;
  return commonsFile(page.pageimage);
}

// 2. Wikidata entity image (P18)
async function fromWikidata(name: string, birthYear?: number | null): Promise<AthletePhoto | null> {
  type Search = { search?: { id: string; description?: string }[] };
  const found = await getJson<Search>(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}` +
      `&language=en&type=item&limit=5&format=json&origin=*`
  );
  const candidates = (found?.search ?? []).filter((c) => looksLikeAthlete(c.description));
  if (candidates.length === 0) return null;

  type Entities = {
    entities?: Record<string, {
      claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
    }>;
  };
  const data = await getJson<Entities>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${candidates.map((c) => c.id).join("|")}` +
      `&props=claims&format=json&origin=*`
  );
  for (const c of candidates) {
    const claims = data?.entities?.[c.id]?.claims;
    const image = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (typeof image !== "string") continue;
    if (birthYear) {
      const dob = claims?.P569?.[0]?.mainsnak?.datavalue?.value as { time?: string } | undefined;
      const y = dob?.time ? Number(dob.time.slice(1, 5)) : null;
      if (y && y !== birthYear) continue; // homonym
    }
    const photo = await commonsFile(image);
    if (photo) return photo;
  }
  return null;
}

type PhotoCacheRow = { url: string | null; author: string | null; license: string | null; source_url: string | null };

async function readPhotoCache(name: string, birthYearKey: number): Promise<{ hit: true; photo: AthletePhoto | null } | { hit: false }> {
  try {
    const rows = await pgQuery<PhotoCacheRow>(
      `SELECT url, author, license, source_url FROM athlete_photos WHERE name = $1 AND birth_year = $2`,
      [name, birthYearKey]
    );
    if (rows.length === 0) return { hit: false };
    const row = rows[0];
    return { hit: true, photo: row.url ? { url: row.url, author: row.author, license: row.license, sourceUrl: row.source_url! } : null };
  } catch {
    // Postgres unreachable or the table isn't there yet -- fall through to
    // the live lookup rather than failing the whole page.
    return { hit: false };
  }
}

function writePhotoCache(name: string, birthYearKey: number, photo: AthletePhoto | null) {
  // Fire-and-forget: the response shouldn't wait on this write, and a
  // failed write just means the next request re-resolves live instead of
  // hitting cache -- not worth failing the page over.
  pgQuery(
    `INSERT INTO athlete_photos (name, birth_year, url, author, license, source_url, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (name, birth_year) DO UPDATE
       SET url = EXCLUDED.url, author = EXCLUDED.author, license = EXCLUDED.license,
           source_url = EXCLUDED.source_url, resolved_at = now()`,
    [name, birthYearKey, photo?.url ?? null, photo?.author ?? null, photo?.license ?? null, photo?.sourceUrl ?? null]
  ).catch(() => {});
}

// React-cached per request: the athlete page calls this from two places
// (the photo itself, the credits toast) now that the lookup is no longer
// stuffed into the same Promise.all as the page's BigQuery data -- without
// this they'd fire the Wikipedia/Wikidata chain (or even just the cache
// read) twice.
export const getAthletePhotoInfo = cache(async (name: string, birthYear?: number | null): Promise<AthletePhoto | null> => {
  const birthYearKey = birthYear ?? 0;
  const cached = await readPhotoCache(name, birthYearKey);
  if (cached.hit) return cached.photo;

  const photo = (await fromWikipedia(name)) ?? (await fromWikidata(name, birthYear));
  writePhotoCache(name, birthYearKey, photo);
  return photo;
});

// Back-compatible URL-only helper (lists, avatars).
export async function getAthletePhoto(name: string, birthYear?: number | null): Promise<string | null> {
  return (await getAthletePhotoInfo(name, birthYear))?.url ?? null;
}

function photoKey(name: string, birthYear?: number | null) {
  return `${name}|${birthYear ?? 0}`;
}

// Photo wall / podium-style call sites (Countries, Rankings) used to call
// getAthletePhotoInfo once per athlete, each paying its own cache-read
// round trip -- fine when that read meant "ask Wikipedia", pointless
// self-imposed latency now that a hit is a single indexed Postgres read.
// Confirmed live: Countries stayed at ~3.5-4.6s even with every one of
// its 12 athletes already cached, because the throttled loop still made
// 4 sequential round trips for what should've been one batched read.
// This does ONE query for every requested athlete's cache status, then
// only falls through to the (still-throttled, for real Wikimedia calls)
// live lookup for genuine misses.
export async function getAthletePhotosBatch(
  people: { name: string; birthYear?: number | null }[]
): Promise<Map<string, AthletePhoto | null>> {
  const result = new Map<string, AthletePhoto | null>();
  if (people.length === 0) return result;

  const keyed = people.map((p) => ({ ...p, birthYearKey: p.birthYear ?? 0 }));
  type Row = PhotoCacheRow & { name: string; birth_year: number };
  let rows: Row[] = [];
  try {
    rows = await pgQuery<Row>(
      `SELECT name, birth_year, url, author, license, source_url FROM athlete_photos
       WHERE (name, birth_year) IN (
         SELECT * FROM UNNEST($1::text[], $2::int[])
       )`,
      [keyed.map((p) => p.name), keyed.map((p) => p.birthYearKey)]
    );
  } catch {
    // fall through -- everyone below is treated as a miss
  }
  const cachedByKey = new Map(rows.map((r) => [photoKey(r.name, r.birth_year), r]));

  const misses: typeof keyed = [];
  for (const p of keyed) {
    const k = photoKey(p.name, p.birthYearKey);
    const row = cachedByKey.get(k);
    if (row) {
      result.set(k, row.url ? { url: row.url, author: row.author, license: row.license, sourceUrl: row.source_url! } : null);
    } else {
      misses.push(p);
    }
  }

  // Only the genuine misses go through the live (throttled) Wikipedia
  // chain -- same 3-at-a-time burst limit as before, now applied to a
  // much smaller set on a warm cache.
  for (let i = 0; i < misses.length; i += 3) {
    const batch = misses.slice(i, i + 3);
    const photos = await Promise.all(batch.map((p) => getAthletePhotoInfo(p.name, p.birthYear)));
    batch.forEach((p, j) => result.set(photoKey(p.name, p.birthYearKey), photos[j]));
  }

  return result;
}

// One-line credit, e.g. "Photo: Jane Doe, CC BY-SA 4.0, via Wikimedia Commons"
export function photoCredit(p: AthletePhoto) {
  return ["Photo:", [p.author, p.license].filter(Boolean).join(", "), "via Wikimedia Commons"]
    .filter(Boolean)
    .join(" ")
    .replace("Photo: via", "Photo via");
}
