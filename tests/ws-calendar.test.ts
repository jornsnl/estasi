import { describe, expect, it } from "vitest";
import { gridRange, monthGrid, neighbours, parseMonth } from "@/lib/ws/calendar";

describe("agenda calendar", () => {
  it("makes whole weeks from Monday to Sunday", () => {
    const weeks = monthGrid(2026, 11); // 1 November 2026 is a Sunday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ date: "2026-10-26", day: 26, inMonth: false });
    expect(weeks[0][6]).toEqual({ date: "2026-11-01", day: 1, inMonth: true });
    expect(gridRange(weeks)).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });
  it("starts a month that begins on Monday without days before it", () => {
    const weeks = monthGrid(2027, 2); // 1 February 2027 is a Monday
    expect(weeks[0][0].date).toBe("2027-02-01");
    expect(weeks).toHaveLength(4);
  });
  it("reads the month from the address and finds the neighbours", () => {
    expect(parseMonth("2027-01", "2026-11-10")).toEqual({ year: 2027, month: 1 });
    expect(parseMonth("2027-13", "2026-11-10")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth(undefined, "2026-11-10")).toEqual({ year: 2026, month: 11 });
    expect(neighbours(2026, 12)).toEqual({ prev: "2026-11", next: "2027-01" });
    expect(neighbours(2027, 1)).toEqual({ prev: "2026-12", next: "2027-02" });
  });
});
