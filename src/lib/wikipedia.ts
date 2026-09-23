// Foto libre desde Wikipedia, para un conjunto pequeño y acotado de
// atletas (los que aparecen en el ranking/marcas mostrados, no todo el
// registro). No se descarga ni se almacena nada propio: solo se enlaza
// la imagen de Wikipedia, con caché de 1 día via fetch de Next.js.
//
// Riesgo real con nombres comunes (ya lo hemos visto en la propia base de
// datos: "David Garcia", "Marta Perez"...): la búsqueda puede devolver a
// otra persona homónima. Mitigación: solo se usa la foto si el extracto
// de la página menciona explícitamente atletismo/la prueba -- no elimina
// el riesgo del todo, pero descarta la mayoría de falsos positivos obvios
// (otra profesión, otro deporte).

const ATHLETICS_KEYWORDS = [
  "athlet", "sprint", "hurdl", "javelin", "discus", "shot put", "hammer throw",
  "long jump", "high jump", "pole vault", "triple jump", "marathon", "race walk",
  "track and field", "middle-distance", "long-distance runner", "decathlete", "heptathlete",
  "relay", "olympic", "world championships",
];

type WikiSummary = {
  title: string;
  extract: string;
  thumbnail?: { source: string };
};

async function fetchSummary(title: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { next: { revalidate: 60 * 60 * 24 } } // 1 día
    );
    if (!res.ok) return null;
    return (await res.json()) as WikiSummary;
  } catch {
    return null;
  }
}

async function searchTitle(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=1&namespace=0&format=json&origin=*`,
      { next: { revalidate: 60 * 60 * 24 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as [string, string[], string[], string[]];
    return data[1]?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getAthletePhoto(name: string): Promise<string | null> {
  const title = (await searchTitle(name)) ?? name;
  const summary = await fetchSummary(title);
  if (!summary?.thumbnail?.source) return null;

  const extractLower = summary.extract.toLowerCase();
  const looksLikeAthlete = ATHLETICS_KEYWORDS.some((kw) => extractLower.includes(kw));
  if (!looksLikeAthlete) return null;

  return summary.thumbnail.source;
}
