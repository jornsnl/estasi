import { describe, expect, it } from "vitest";
import { readBudgetForm } from "@/lib/ws/budget";
import { hexToHsv, hsvToHex, isLight, normalizeHex, readPalette, writePalette } from "@/lib/ws/color";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("kleuren", () => {
  it("normaliseert hexcodes", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex(" a89650 ")).toBe("#a89650");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("rood")).toBeNull();
  });

  it("rekent heen en terug tussen hex en HSV", () => {
    for (const hex of ["#a89650", "#6b1e2e", "#f5f0e8", "#000000", "#ffffff", "#7e9c86"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
  });

  it("kiest donkere tekst op lichte kleuren", () => {
    expect(isLight("#f5f0e8")).toBe(true);
    expect(isLight("#6b1e2e")).toBe(false);
  });

  it("leest bestaande paletten zonder namen en bewaart volgorde en namen", () => {
    expect(readPalette(["#C98B6B", "#7e9c86", "geen"], undefined)).toEqual([
      { hex: "#c98b6b", name: "" },
      { hex: "#7e9c86", name: "" },
    ]);
    const palette = readPalette(["#7e9c86", "#c98b6b"], { "#7e9c86": "Eucalyptus" });
    expect(palette).toEqual([
      { hex: "#7e9c86", name: "Eucalyptus" },
      { hex: "#c98b6b", name: "" },
    ]);
    expect(writePalette([...palette, { hex: "#7E9C86", name: "dubbel" }])).toEqual({ colors: ["#7e9c86", "#c98b6b"], names: { "#7e9c86": "Eucalyptus" } });
    expect(writePalette(Array.from({ length: 20 }, (_, i) => ({ hex: `#0000${i.toString(16).padStart(2, "0")}`, name: "" })), 12).colors).toHaveLength(12);
  });
});

describe("budgetformulier", () => {
  it("leest totaal en bedragen per onderdeel", () => {
    const form = readBudgetForm([
      ["budgetTotal", "25.000"],
      [`budget-${A}`, "1.250,50"],
      [`budget-${B}`, ""],
      ["a-vraag", "tekst"],
      ["budget-geen-uuid", "10"],
    ]);
    expect(form).toEqual({ total: 2_500_000, lines: [{ id: A, cents: 125_050 }, { id: B, cents: 0 }], errors: [] });
  });

  it("leeg totaal is geen totaal; zonder totaalveld blijft het ongemoeid", () => {
    expect(readBudgetForm([["budgetTotal", ""]]).total).toBeNull();
    expect(readBudgetForm([[`budget-${A}`, "5"]]).total).toBeUndefined();
  });

  it("meldt ongeldige bedragen met de naam van het onderdeel", () => {
    const form = readBudgetForm([[`budget-${A}`, "veel"], ["budgetTotal", "12,345"]], { [A]: "Fotograaf" });
    expect(form.errors).toEqual(['Fotograaf "veel"', 'Totaalbudget "12,345"']);
    expect(form.lines).toEqual([]);
  });
});
