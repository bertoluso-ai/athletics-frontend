import type { YearProgressionPoint } from "@/lib/queries";

const WIDTH = 700;
const HEIGHT = 220;
const PAD_X = 36;
const PAD_Y = 20;

export default function YearlyProgressionChart({
  data,
  isField,
}: {
  data: YearProgressionPoint[];
  isField: boolean;
}) {
  if (data.length < 2) return null;

  const years = data.map((d) => d.year);
  const values = data.map((d) => d.mark_value);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const x = (year: number) =>
    PAD_X + (maxYear === minYear ? 0 : ((year - minYear) / (maxYear - minYear)) * (WIDTH - 2 * PAD_X));

  // Chart always reads "up = better", regardless of whether the discipline
  // is timed (lower is better) or measured (higher is better).
  const y = (val: number) => {
    const t = maxVal === minVal ? 0.5 : (val - minVal) / (maxVal - minVal);
    const better = isField ? t : 1 - t;
    return PAD_Y + (1 - better) * (HEIGHT - 2 * PAD_Y);
  };

  const points = data.map((d) => `${x(d.year)},${y(d.mark_value)}`).join(" ");

  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <polyline points={points} fill="none" stroke="#f97316" strokeWidth="2" />
        {data.map((d, i) => (
          <circle key={i} cx={x(d.year)} cy={y(d.mark_value)} r="3" fill="#f97316" stroke="#0a0a0a" strokeWidth="1">
            <title>{d.year}: {d.mark_display}</title>
          </circle>
        ))}
        <text x={x(minYear)} y={HEIGHT - 4} fontSize="11" fill="#737373">{minYear}</text>
        <text x={x(maxYear)} y={HEIGHT - 4} fontSize="11" textAnchor="end" fill="#737373">{maxYear}</text>
        <text x={x(minYear)} y={y(values[0]) - 8} fontSize="11" fill="#a3a3a3">{data[0].mark_display}</text>
        <text
          x={x(data[data.length - 1].year)}
          y={y(data[data.length - 1].mark_value) - 8}
          fontSize="11"
          textAnchor="end"
          fill="#a3a3a3"
        >
          {data[data.length - 1].mark_display}
        </text>
      </svg>
    </div>
  );
}
