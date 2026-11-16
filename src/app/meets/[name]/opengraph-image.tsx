import { ImageResponse } from "next/og";
import { getMeetAvailableYears } from "@/lib/queries";

// Imagen al compartir una reunion/campeonato: su nombre y el rango de ediciones con resultados.
export const alt = "Meeting results - AthleticsInfoRanking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const eventName = decodeURIComponent(name);
  let sub = "Results by year and discipline";
  try {
    const years = await getMeetAvailableYears(eventName);
    if (years.length) sub = `${years.length} edition${years.length > 1 ? "s" : ""} with results  |  ${Math.min(...years)}-${Math.max(...years)}`;
  } catch {
    /* imagen generica */
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "70px", background: "#14181f", color: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div style={{ display: "flex", width: 120, height: 10, background: "#ea580c", marginBottom: 34 }} />
        <div style={{ fontSize: eventName.length > 40 ? 58 : 76, fontWeight: 800, lineHeight: 1.08 }}>{eventName}</div>
        <div style={{ fontSize: 36, marginTop: 26, color: "#d9dce2" }}>{sub}</div>
        <div style={{ position: "absolute", bottom: 40, right: 70, fontSize: 28, color: "#a3a9b4" }}>AthleticsInfoRanking</div>
      </div>
    ),
    size
  );
}
