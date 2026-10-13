// Niveles segun el percentil historico del indice global (athlete_global_index): pct = 100 - top_pct (99.9 = mejor 0,1 %).
// Cambiar aqui los umbrales o las etiquetas los cambia en la ficha del atleta y en Rankings.

export type Tier = { min: number; label: string; className: string };

export const TIERS: Tier[] = [
  { min: 99.9, label: "GOAT", className: "bg-amber-400 text-black" },
  { min: 99, label: "Legend", className: "bg-orange-500 text-black" },
  { min: 95, label: "Star", className: "bg-violet-500 text-white" },
  { min: 90, label: "Elite", className: "bg-sky-500 text-white" },
  { min: 75, label: "Pro", className: "bg-emerald-600 text-white" },
  { min: 50, label: "Contender", className: "bg-neutral-600 text-white" },
  { min: 25, label: "Rising", className: "bg-neutral-700 text-neutral-200" },
  { min: 0, label: "Emerging", className: "bg-neutral-800 text-neutral-400" },
];

export function tierFor(pct: number): Tier {
  return TIERS.find((t) => pct >= t.min) ?? TIERS[TIERS.length - 1];
}

// percentil a partir de top_pct (1 = mejor 1 %): 99 -> "99.0", 99.99 -> "99.99"
export function percentileFromTop(topPct: number): number {
  return Math.min(99.99, Math.max(0, 100 - topPct));
}

export function formatPercentile(pct: number): string {
  return pct >= 99.9 ? pct.toFixed(2) : pct.toFixed(1);
}
