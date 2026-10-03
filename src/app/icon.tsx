import { ImageResponse } from "next/og";

// Browser tab icon: same "AIR" badge as the Header logo (orange-500 bg,
// black bold text) instead of the default Next.js icon.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f97316",
          borderRadius: 6,
          color: "#000",
          fontSize: 14,
          fontWeight: 900,
          letterSpacing: -0.5,
          fontFamily: "sans-serif",
        }}
      >
        AIR
      </div>
    ),
    size
  );
}
