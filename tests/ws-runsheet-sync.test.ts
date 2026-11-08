import { describe, expect, it } from "vitest";
import {
  cleanTime,
  findDuplicates,
  mealRows,
  placeByTime,
  planSync,
  supplierRows,
  withVirtualTabs,
  type ExistingRow,
} from "@/lib/ws/runsheet-pure";

const moment = (id: string, name: string, at_time: string, active = true) => ({ id, name, at_time, active });
const supplier = (id: string, name: string, category_name: string, present_from: string, present_until: string, status = "booked") => ({
  id, name, category_name, present_from, present_until, status,
});

describe("draaiboek: volgorde tabbladen", () => {
  it("zet Leveranciers na de gastenlijst en Eten na de groepsfoto's", () => {
    const tabs = [
      { id: "1", title: "Dagplanning", kind: "schedule", position: 1 },
      { id: "2", title: "Gastenlijst", kind: "guests", position: 2 },
      { id: "3", title: "Groepsfoto's", kind: "photos", position: 3 },
      { id: "4", title: "Stylingplan", kind: "styling", position: 4 },
      { id: "5", title: "Opstelling", kind: "seating", position: 5 },
      { id: "6", title: "Meeneemlijst", kind: "packing", position: 6 },
    ];
    expect(withVirtualTabs(tabs).map((t) => t.title)).toEqual([
      "Dagplanning", "Gastenlijst", "Leveranciers", "Groepsfoto's", "Eten & allergieën", "Stylingplan", "Opstelling", "Meeneemlijst",
    ]);
  });
  it("zet ze achteraan als het tabblad ervoor ontbreekt", () => {
    expect(withVirtualTabs([{ id: "1", title: "Dagplanning", kind: "schedule", position: 1 }]).map((t) => t.id)).toEqual(["1", "leveranciers", "eten"]);
  });
});

describe("draaiboek: rijen uit eten en leveranciers", () => {
  it("maakt een rij per actief eetmoment met een tijd, met het aantal personen", () => {
    const rows = mealRows(
      [moment("d", "Diner", "18:30"), moment("l", "Lunch", ""), moment("o", "Ontbijt", "8:00", false), moment("t", "Taart", "16.00")],
      { d: 86, t: 1 },
    );
    expect(rows.map((r) => [r.source_id, r.at_time, r.what])).toEqual([
      ["d", "18:30", "Diner, 86 personen"],
      ["t", "16.00", "Taart, 1 persoon"],
    ]);
  });
  it("laat het aantal weg als er nog niemand meeeet", () => {
    expect(mealRows([moment("d", "Diner", "18:30")], {})[0].what).toBe("Diner");
  });
  it("maakt aankomst en vertrek per leverancier, niet bij Niet nodig", () => {
    const rows = supplierRows([
      supplier("f", "Studio Licht", "Fotograaf", "13:30", "23:45"),
      supplier("d", "", "DJ", "", "01:00"),
      supplier("x", "Weg BV", "Catering", "10:00", "", "not_needed"),
    ]);
    expect(rows.map((r) => [r.source, r.at_time, r.what])).toEqual([
      ["supplier_from", "13:30", "Aankomst Studio Licht (Fotograaf)"],
      ["supplier_until", "23:45", "Vertrek Studio Licht (Fotograaf)"],
      ["supplier_until", "01:00", "Vertrek DJ"],
    ]);
  });
});

describe("draaiboek: synchroniseren", () => {
  const desired = mealRows([moment("d", "Diner", "18:30"), moment("l", "Lunch", "12:30")], { d: 80, l: 40 });
  const row = (id: string, at_time: string, what: string, source: string | null = null, source_id: string | null = null): ExistingRow => ({ id, at_time, what, source, source_id });

  it("voegt ontbrekende rijen toe en zet ze op hun tijd", () => {
    const plan = planSync([row("a", "10:00", "Ceremonie")], desired);
    expect(plan.insert.map((d) => d.what)).toEqual(["Diner, 80 personen", "Lunch, 40 personen"]);
    expect(plan.place).toHaveLength(2);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });
  it("past naam en tijd aan, en verplaatst alleen bij een andere tijd", () => {
    const plan = planSync([row("x", "18:00", "Diner, 70 personen", "meal", "d"), row("y", "12:30", "Lunch", "meal", "l")], desired);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([
      { id: "x", at_time: "18:30", what: "Diner, 80 personen" },
      { id: "y", at_time: "12:30", what: "Lunch, 40 personen" },
    ]);
    expect(plan.place).toEqual([{ id: "x", source: "meal", source_id: "d" }]);
  });
  it("haalt een rij weg als de bron of de tijd weg is, en nooit dubbel", () => {
    const plan = planSync(
      [row("x", "18:30", "Diner, 80 personen", "meal", "d"), row("x2", "18:30", "Diner, 80 personen", "meal", "d"), row("z", "9:00", "Ontbijt", "meal", "o")],
      desired.filter((d) => d.source_id === "d"),
    );
    expect(plan.remove).toEqual(["x2", "z"]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
  });
  it("laat getypte rijen met rust", () => {
    const plan = planSync([row("m", "18:30", "Diner")], []);
    expect(plan).toEqual({ insert: [], update: [], remove: [], place: [] });
  });
  it("zet een rij op zijn tijd zonder de rest te verschuiven", () => {
    const rows = [
      { id: "a", at_time: "10:00" }, { id: "b", at_time: "" }, { id: "c", at_time: "14:00" }, { id: "new", at_time: "12:00" }, { id: "d", at_time: "20:00" },
    ];
    expect(placeByTime(rows, ["new"])).toEqual(["a", "b", "new", "c", "d"]);
    expect(placeByTime([{ id: "a", at_time: "10:00" }, { id: "new", at_time: "23:45" }], ["new"])).toEqual(["a", "new"]);
  });
  it("meldt getypte rijen die op een automatische rij lijken", () => {
    const rows = [row("m", "18:30", "Diner in de grote zaal"), row("n", "19:00", "Diner"), row("o", "18:30", "Speech"), row("p", "18:30", "Diner", "meal", "d")];
    expect(findDuplicates(rows, desired)).toEqual([{ id: "m", label: "uit Eten en allergieën", what: "18:30 Diner, 80 personen" }]);
  });
});

describe("leveranciers: tijd op locatie", () => {
  it("accepteert een tijd of leeg", () => {
    expect(cleanTime("13:30")).toBe("13:30");
    expect(cleanTime("9.05")).toBe("09:05");
    expect(cleanTime(" ")).toBe("");
    expect(cleanTime("25:00")).toBeNull();
    expect(cleanTime("half twee")).toBeNull();
  });
});
