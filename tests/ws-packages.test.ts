import { describe, expect, it } from "vitest";
import { danceName, offerLines, reorder } from "@/lib/ws/package-order";

const rows = (...positions: number[]) => positions.map((position, i) => ({ id: String.fromCharCode(97 + i), position }));

describe("volgorde van pakketten", () => {
  it("moves up and down and only changes what moves", () => {
    expect(reorder(rows(1, 2, 3), "c", "up")).toEqual([
      { id: "c", position: 2 },
      { id: "b", position: 3 },
    ]);
    expect(reorder(rows(1, 2, 3), "a", "down")).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
    ]);
  });
  it("drags to an index", () => {
    expect(reorder(rows(1, 2, 3, 4), "d", 0)).toEqual([
      { id: "d", position: 1 },
      { id: "a", position: 2 },
      { id: "b", position: 3 },
      { id: "c", position: 4 },
    ]);
  });
  it("keeps the positions of a subset, so other packages stay where they are", () => {
    // The dance packages sit at 3, 4 and 5 among all packages.
    expect(reorder(rows(3, 4, 5), "c", 0)).toEqual([
      { id: "c", position: 3 },
      { id: "a", position: 4 },
      { id: "b", position: 5 },
    ]);
  });
  it("renumbers ties", () => {
    expect(reorder(rows(0, 0, 0), "a", "down")).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
      { id: "c", position: 3 },
    ]);
  });
  it("does nothing at the edges or for unknown rows", () => {
    expect(reorder(rows(1, 2), "a", "up")).toBeNull();
    expect(reorder(rows(1, 2), "b", "down")).toBeNull();
    expect(reorder(rows(1, 2), "x", 0)).toBeNull();
    expect(reorder(rows(1, 2), "a", 5)).toBeNull();
  });
});

describe("openingsdanskaarten", () => {
  it("shows the name without the prefix", () => {
    expect(danceName("Openingsdans: Our Song")).toBe("Our Song");
    expect(danceName("The Showstopper")).toBe("The Showstopper");
  });
  it("turns the description into items, else the addition", () => {
    expect(offerLines("Dans tot 2 min\n- 3 privélessen\n\n• Muziekmix ")).toEqual(["Dans tot 2 min", "3 privélessen", "Muziekmix"]);
    expect(offerLines("", "2 privélessen")).toEqual(["2 privélessen"]);
    expect(offerLines("")).toEqual([]);
  });
});
