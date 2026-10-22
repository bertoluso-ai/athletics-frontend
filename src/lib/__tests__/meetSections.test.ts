import { describe, it, expect } from "vitest";
import { groupResults } from "@/components/MeetResultsSections";
import type { MeetResultRow } from "@/lib/queries";

// Boysen Memorial 2025, 100 m hombres: en WA son "Final 1".."Final 6", cada una con sus puestos 1-8.
// En la base todas llevan round = "Final" y se distinguen solo por race_number.
function row(race: number | null, place: number, name: string, mark: number, wind: string, extra: Partial<MeetResultRow> = {}): MeetResultRow {
  return {
    event_name: "Boysen Memorial", series_name: "Boysen Memorial", athletics_event: "100 Metres", gender: "Men", round: "Final",
    place, athlete_id: name, display_name: name, mark_display: mark.toFixed(2), mark_value: mark, nationality: "NOR", record: null,
    city: "Oslo", country: "NOR", date: "2025-07-02", wind, wind_legal: Number(wind) <= 2, division_key_resolved: "C",
    is_shadow_result: null, race_level: 126, race_number: race, ...extra,
  };
}
const rows = [
  row(2, 1, "Johannes Lunde", 11.2, "+2.1"), row(2, 2, "Even Pedersen", 11.41, "+2.1"), row(2, 3, "Emil Vestre", 11.44, "+2.1"),
  row(3, 1, "Theodore Waldron", 10.91, "+3.3"), row(3, 2, "Emiliano Ortiz", 10.93, "+3.3"), row(3, 3, "Albin Botez", 10.98, "+3.3"),
  row(4, 1, "Marius Hjeltnes", 10.84, "+0.8"), row(4, 2, "Christian Wright", 10.86, "+0.8"), row(4, 3, "Jonathan Degaard", 10.91, "+0.8"),
];

describe("groupResults con race_number", () => {
  it("una serie por race_number, con su puesto 1 propio y su viento", () => {
    const g = groupResults(rows);
    expect(g).toHaveLength(3);
    expect(g.map((x) => x.heat)).toEqual([2, 3, 4]);
    for (const s of g) expect(s.rows.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(g.map((x) => x.wind)).toEqual(["+2.1", "+3.3", "+0.8"]);
  });
  it("dentro de cada serie los puestos siguen a las marcas (nada de puestos 1,3,4,5,7,2,8,6)", () => {
    for (const s of groupResults(rows)) {
      const marks = s.rows.map((r) => r.mark_value as number);
      expect([...marks].sort((a, b) => a - b)).toEqual(marks);
    }
  });
  it("si falta race_number en alguna fila vuelve al método de siempre", () => {
    const mixed = [...rows, row(null, 1, "Sin Serie", 10.5, "+0.1")];
    expect(groupResults(mixed).every((g) => g.heat == null)).toBe(true);
  });
  it("con una sola serie no cambia nada", () => {
    const g = groupResults(rows.filter((r) => r.race_number === 3));
    expect(g).toHaveLength(1);
    expect(g[0].heat == null).toBe(true);
  });
});
