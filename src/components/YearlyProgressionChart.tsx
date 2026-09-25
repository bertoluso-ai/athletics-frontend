"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { YearProgressionPoint } from "@/lib/queries";

// Best mark by year, readable:
//   - dots: each year's best mark (muted)
//   - orange step line: the best mark ever up to that year (the real
//     progression: every step is a new all-time best)
//   - range: Since 2000 / Since 1980 / All time (recent by default), and
//     the line breaks where years are missing instead of drawing a
//     straight line across decades with no data
//   - hover: year, mark, athlete, country
// Always "up = better", for timed (lower) and measured (higher) events.

const PAD = { l: 48, r: 16, t: 16, b: 28 };
const RANGES = [
  { key: "2000", label: "Since 2000", from: 2000 },
  { key: "1980", label: "Since 1980", from: 1980 },
  { key: "all", label: "All time", from: -Infinity },
] as const;

export default function YearlyProgressionChart({ data, isField }: { data: YearProgressionPoint[]; isField: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <Chart data={data} isField={isField} onExpand={() => setExpanded(true)} />
      {expanded && (
        // full-screen view (best with the phone in landscape)
        <div className="fixed inset-0 z-[60] bg-neutral-950/95 backdrop-blur p-3 sm:p-8 flex flex-col" onClick={() => setExpanded(false)}>
          <div className="flex justify-end mb-2">
            <button onClick={() => setExpanded(false)} className="text-sm px-3 py-1 rounded bg-neutral-800 text-neutral-200">
              ✕ Close
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full">
              <Chart data={data} isField={isField} tall />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Chart({
  data,
  isField,
  onExpand,
  tall = false,
}: {
  data: YearProgressionPoint[];
  isField: boolean;
  onExpand?: () => void;
  tall?: boolean;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("2000");
  const [hover, setHover] = useState<number | null>(null);
  // draw at the container's real pixel width, so text and dots keep their
  // size on phones instead of shrinking with a fixed viewBox; taller there
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = tall ? Math.round(Math.min(W * 0.55, typeof window !== "undefined" ? window.innerHeight * 0.7 : 500)) : W < 640 ? Math.round(W * 0.75) : 260;

  // all-time best up to each year, computed on the FULL history so a
  // record from before the visible range still sets the level
  const withBest = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.year - b.year);
    let best: YearProgressionPoint | null = null;
    return sorted.map((d) => {
      if (!best || (isField ? d.mark_value > best.mark_value : d.mark_value < best.mark_value)) best = d;
      return { ...d, best: best! };
    });
  }, [data, isField]);

  const from = RANGES.find((r) => r.key === range)!.from;
  const pts = withBest.filter((d) => d.year >= from);
  if (pts.length < 2) return null;

  const years = pts.map((d) => d.year);
  const vals = pts.flatMap((d) => [d.mark_value, d.best.mark_value]);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const padV = (hi - lo) * 0.08 || 0.1;
  lo -= padV;
  hi += padV;

  const x = (yr: number) => PAD.l + (maxY === minY ? 0 : ((yr - minY) / (maxY - minY)) * (W - PAD.l - PAD.r));
  // up = better
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo);
    return isField ? H - PAD.b - t * (H - PAD.t - PAD.b) : PAD.t + t * (H - PAD.t - PAD.b);
  };

  // step line of the all-time best, broken where years are missing (gap > 4)
  const segments: string[] = [];
  let cur = "";
  pts.forEach((d, i) => {
    const prev = pts[i - 1];
    if (!prev || d.year - prev.year > 4) {
      if (cur) segments.push(cur);
      cur = `M${x(d.year)},${y(d.best.mark_value)}`;
    } else {
      cur += ` H${x(d.year)} V${y(d.best.mark_value)}`;
    }
  });
  if (cur) segments.push(cur);

  // grid: 4 horizontal lines, decade ticks
  const gridVals = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const step = maxY - minY > 60 ? 20 : maxY - minY > 25 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = Math.ceil(minY / step) * step; t <= maxY; t += step) ticks.push(t);
  const fmt = (v: number) => (isField ? v.toFixed(2) : v >= 60 ? `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, "0")}` : v.toFixed(2));

  const h = hover !== null ? pts[hover] : null;
  const allTime = withBest[withBest.length - 1]?.best;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-orange-500" /> best ever
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" /> best of the year
          </span>
          {allTime && (
            <span className="text-neutral-500">
              All-time best: <span className="font-mono text-orange-400">{allTime.mark_display}</span>
              {allTime.athlete ? ` · ${allTime.athlete}` : ""} ({allTime.year})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
        {onExpand && (
          <button onClick={onExpand} title="Enlarge" className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white">
            ⤢
          </button>
        )}
        <div className="flex rounded bg-neutral-800 p-0.5 text-[11px]">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-2 py-0.5 rounded ${range === r.key ? "bg-orange-500 text-black font-semibold" : "text-neutral-400"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto" onMouseLeave={() => setHover(null)}>
          {gridVals.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#262626" />
              <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#737373">
                {fmt(v)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="10" fill="#737373">
              {t}
            </text>
          ))}
          {segments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#f97316" strokeWidth="2.5" />
          ))}
          {pts.map((d, i) => (
            <circle
              key={d.year}
              cx={x(d.year)}
              cy={y(d.mark_value)}
              r={hover === i ? 5 : 3}
              fill={d.mark_value === d.best.mark_value ? "#f97316" : "#a3a3a3"}
              stroke="#0a0a0a"
              strokeWidth="1"
            />
          ))}
          {/* invisible hover bands, one per year */}
          {pts.map((d, i) => {
            const left = i === 0 ? PAD.l : (x(pts[i - 1].year) + x(d.year)) / 2;
            const right = i === pts.length - 1 ? W - PAD.r : (x(d.year) + x(pts[i + 1].year)) / 2;
            return (
              <rect key={`h${d.year}`} x={left} y={PAD.t} width={Math.max(1, right - left)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            );
          })}
          {h && <line x1={x(h.year)} x2={x(h.year)} y1={PAD.t} y2={H - PAD.b} stroke="#525252" strokeDasharray="3 3" pointerEvents="none" />}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-neutral-700 bg-neutral-900/95 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${Math.min(80, Math.max(0, (x(h.year) / W) * 100 - 10))}%` }}
          >
            <div className="font-semibold text-neutral-200">{h.year}</div>
            <div>
              <span className="font-mono text-neutral-100">{h.mark_display}</span>
              {h.athlete && <span className="text-neutral-400"> · {h.athlete}{h.nationality ? ` (${h.nationality})` : ""}</span>}
            </div>
            <div className="text-neutral-500">
              best ever then: <span className="font-mono text-orange-400">{h.best.mark_display}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
