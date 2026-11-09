import { describe, expect, it } from "vitest";
import { ADD_BLOCK_OPTIONS, emptyBlock, isContentBlock } from "@/lib/domain/blocks";

describe("lesblokken voor titels en leerdoelen", () => {
  it("maakt een titelblok in de gekozen stijl, en valt terug op hoofdtitel", () => {
    expect(emptyBlock("heading", "subtitle", "b1")).toEqual({ id: "b1", type: "heading", style: "subtitle", text: "" });
    expect(emptyBlock("heading", "onzin", "b2")).toMatchObject({ style: "title" });
  });
  it("maakt een leeg leerdoelenblok", () => {
    expect(emptyBlock("goals", "", "b3")).toEqual({ id: "b3", type: "goals", title: "Leerdoelen", items: [] });
  });
  it("telt titels en leerdoelen als inhoud, niet als opdracht", () => {
    expect(isContentBlock(emptyBlock("heading", "title", "x")!)).toBe(true);
    expect(isContentBlock(emptyBlock("goals", "", "y")!)).toBe(true);
    expect(isContentBlock(emptyBlock("assignment", "", "z")!)).toBe(false);
  });
  it("biedt alle stijlen uit de feedback aan in de editor", () => {
    expect(ADD_BLOCK_OPTIONS.map((o) => o.label)).toEqual(
      expect.arrayContaining(["Hoofdtitel", "Subtitel", "Bijschrift", "Leerdoelen", "Opdrachttitel", "Tekstvak"]),
    );
  });
});
