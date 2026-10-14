import { describe, expect, it } from "vitest";
import { TIERS, formatPercentile, percentileFromTop, tierFor } from "../tiers";

describe("tierFor", () => {
  it.each([
    [100, "GOAT"], [99.9, "GOAT"], [99.89, "Legend"], [99, "Legend"], [98.99, "Star"], [95, "Star"],
    [90, "Elite"], [75, "Pro"], [50, "Contender"], [25, "Rising"], [24.99, "Emerging"], [0, "Emerging"],
  ])("pct %s -> %s", (pct, label) => expect(tierFor(pct).label).toBe(label));

  it("valores fuera de rango no revientan", () => {
    expect(tierFor(-5).label).toBe("Emerging");
    expect(tierFor(250).label).toBe("GOAT");
  });

  it("umbrales estrictamente decrecientes (si no, find() devolveria un nivel equivocado)", () => {
    const mins = TIERS.map((t) => t.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(new Set(mins).size).toBe(mins.length);
    expect(mins[mins.length - 1]).toBe(0);
  });
});

describe("percentileFromTop / formatPercentile", () => {
  it("convierte top% a percentil y lo acota a 0..99.99", () => {
    expect(percentileFromTop(1)).toBe(99);
    expect(percentileFromTop(0)).toBe(99.99);
    expect(percentileFromTop(150)).toBe(0);
  });
  it("2 decimales solo desde 99.9", () => {
    expect(formatPercentile(99.99)).toBe("99.99");
    expect(formatPercentile(99)).toBe("99.0");
    expect(formatPercentile(50.04)).toBe("50.0");
  });
});
