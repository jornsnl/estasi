import { describe, expect, it } from "vitest";
import { groupByWeddingYear } from "@/lib/ws/by-year";

describe("bruidsparen per trouwjaar", () => {
  it("groepeert per jaar, op datum, en zet paren zonder datum achteraan", () => {
    const groups = groupByWeddingYear([
      { id: "a", wedding_date: "2027-05-01" },
      { id: "b", wedding_date: null },
      { id: "c", wedding_date: "2026-09-12" },
      { id: "d", wedding_date: "2026-06-01" },
    ]);
    expect(groups.map((g) => [g.year, g.rows.map((r) => r.id)])).toEqual([
      ["2026", ["d", "c"]],
      ["2027", ["a"]],
      ["Nog geen datum", ["b"]],
    ]);
  });
});
