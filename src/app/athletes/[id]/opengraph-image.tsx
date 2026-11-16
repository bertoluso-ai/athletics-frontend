import { ImageResponse } from "next/og";
import { getAthleteIdBySlug, getAthleteInfo, getAthleteBestResults } from "@/lib/queries";
import { countryName } from "@/lib/flags";
import { eventLabel } from "@/lib/events";

// Imagen al compartir la ficha de un atleta: nombre, pais, años y sus mejores podios. Si algo falla, la de la portada.
export const alt = "Athlete profile - AthleticsInfoRanking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

const MEDAL = ["Gold", "Silver", "Bronze"];

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  let name = "Athlete";
  let sub = "";
  const lines: string[] = [];
  try {
    const id = await getAthleteIdBySlug(slug);
    const info = id ? await getAthleteInfo(id) : null;
    if (id && info) {
      name = info.display_name;
      const c = countryName(info.nationality);
      sub = [c, info.first_year ? `${info.first_year}-${info.last_year}` : null].filter(Boolean).join("  |  ");
      const best = await getAthleteBestResults(id, 3);
      for (const b of best) lines.push(`${MEDAL[b.place - 1]}${b.n > 1 ? ` x${b.n}` : ""}  ${b.series_name}  ${eventLabel(b.athletics_event)}`);
    }
  } catch {
    /* sin datos: imagen generica con el nombre del slug */
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "70px", background: "#14181f", color: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div style={{ display: "flex", width: 120, height: 10, background: "#ea580c", marginBottom: 34 }} />
        <div style={{ fontSize: name.length > 24 ? 66 : 82, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
        {sub ? <div style={{ fontSize: 36, marginTop: 18, color: "#d9dce2" }}>{sub}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontSize: 30, marginTop: 10, color: "#fdba74" }}>{l}</div>
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 40, right: 70, fontSize: 28, color: "#a3a9b4" }}>AthleticsInfoRanking</div>
      </div>
    ),
    size
  );
}
