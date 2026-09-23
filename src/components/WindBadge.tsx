export default function WindBadge({ wind, windLegal }: { wind: string | null; windLegal: boolean | null }) {
  if (windLegal !== false) return null;
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400"
      title={`Wind-assisted: ${wind ?? "?"} m/s exceeds the +2.0 m/s legal limit -- not eligible as a record`}
    >
      w {wind}
    </span>
  );
}
