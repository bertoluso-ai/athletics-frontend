// Athlete photos from free sources only (Wikimedia Commons), with the
// author/licence credit that those licences require. Nothing is stored:
// the image is linked from Wikimedia, lookups cached 1 day by Next's fetch.
//
// Lookup order:
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

export async function getAthletePhotoInfo(name: string, birthYear?: number | null): Promise<AthletePhoto | null> {
  return (await fromWikipedia(name)) ?? (await fromWikidata(name, birthYear));
}

// Back-compatible URL-only helper (lists, avatars).
export async function getAthletePhoto(name: string, birthYear?: number | null): Promise<string | null> {
  return (await getAthletePhotoInfo(name, birthYear))?.url ?? null;
}

// One-line credit, e.g. "Photo: Jane Doe, CC BY-SA 4.0, via Wikimedia Commons"
export function photoCredit(p: AthletePhoto) {
  return ["Photo:", [p.author, p.license].filter(Boolean).join(", "), "via Wikimedia Commons"]
    .filter(Boolean)
    .join(" ")
    .replace("Photo: via", "Photo via");
}
