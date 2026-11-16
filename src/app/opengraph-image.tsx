import { ImageResponse } from "next/og";

// Imagen por defecto al compartir cualquier pagina en redes (WhatsApp, X, Facebook, LinkedIn, Telegram...).
// Las paginas de atleta y de reunion pueden sobrescribirla con su propio opengraph-image.
export const alt = "AthleticsInfoRanking - Athletics results, rankings and records";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#14181f",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", width: 120, height: 10, background: "#ea580c", marginBottom: 40 }} />
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>AthleticsInfoRanking</div>
        <div style={{ fontSize: 38, marginTop: 28, color: "#d9dce2", lineHeight: 1.3 }}>
          Athletics results, rankings and records: track &amp; field, road running and race walking.
        </div>
      </div>
    ),
    size
  );
}
