import { describe, expect, it } from "vitest";
import { ceremonyRows, ceremonySeats, cleanRows, evenRows, keyAfterRowRemoval, rowChange, rowSeatKeys } from "@/lib/ws/seating-geometry";
import { applyMove, moveMessage, objectLabel, planMove, type ChairRow } from "@/lib/ws/seating-moves";

const guest = (seat_key: string, guest_id: string): ChairRow => ({ seat_key, guest_id, name: "", object_id: null });
const thing = (seat_key: string, object_id: string): ChairRow => ({ seat_key, guest_id: null, name: "", object_id });

describe("Opstelling: verplaatsen en wisselen", () => {
  it("moves a guest to an empty chair and leaves the rest", () => {
    const chairs = [guest("A", "anna"), guest("B", "mark"), guest("C", "els")];
    const plan = planMove(chairs, [], { seat: "A" }, { seat: "D" });
    expect(plan.kind).toBe("moved");
    if (plan.kind === "none") return;
    const next = applyMove(chairs, [], plan.ops).chairs;
    expect(next.find((c) => c.seat_key === "D")?.guest_id).toBe("anna");
    expect(next.find((c) => c.seat_key === "A")).toBeUndefined();
    expect(next.find((c) => c.seat_key === "B")?.guest_id).toBe("mark");
    expect(next.find((c) => c.seat_key === "C")?.guest_id).toBe("els");
  });

  it("swaps two guests", () => {
    const chairs = [guest("A", "anna"), guest("B", "mark")];
    const plan = planMove(chairs, [], { seat: "A" }, { seat: "B" });
    expect(plan.kind).toBe("swapped");
    if (plan.kind === "none") return;
    expect(plan.a).toEqual({ seat: "A" });
    expect(plan.b).toEqual({ seat: "B" });
    const next = applyMove(chairs, [], plan.ops).chairs;
    expect(next.find((c) => c.seat_key === "A")?.guest_id).toBe("mark");
    expect(next.find((c) => c.seat_key === "B")?.guest_id).toBe("anna");
    expect(next).toHaveLength(2);
  });

  it("swaps a guest with an object on a chair", () => {
    const chairs = [guest("A", "anna"), thing("B", "vaas")];
    const plan = planMove(chairs, [{ id: "vaas", x: 10, y: 10 }], { object: "vaas" }, { seat: "A" });
    expect(plan.kind).toBe("swapped");
    if (plan.kind === "none") return;
    const next = applyMove(chairs, [], plan.ops).chairs;
    expect(next.find((c) => c.seat_key === "A")?.object_id).toBe("vaas");
    expect(next.find((c) => c.seat_key === "B")?.guest_id).toBe("anna");
  });

  it("moves loose objects and swaps their places", () => {
    const objects = [{ id: "babs", x: 30, y: 8 }, { id: "piano", x: 70, y: 8 }];
    const moved = planMove([], objects, { object: "babs" }, { point: { x: 50, y: 40 } });
    expect(moved.kind).toBe("moved");
    if (moved.kind === "none") return;
    expect(applyMove([], objects, moved.ops).objects[0]).toEqual({ id: "babs", x: 50, y: 40 });
    const swapped = planMove([], objects, { object: "babs" }, { object: "piano" });
    expect(swapped.kind).toBe("swapped");
    if (swapped.kind === "none") return;
    expect(applyMove([], objects, swapped.ops).objects).toEqual([{ id: "babs", x: 70, y: 8 }, { id: "piano", x: 30, y: 8 }]);
  });

  it("puts a loose object on a chair and takes it off again", () => {
    const objects = [{ id: "bloem", x: 20, y: 20 }];
    const on = planMove([], objects, { object: "bloem" }, { seat: "t:1:0" });
    expect(on.kind).toBe("moved");
    if (on.kind === "none") return;
    const chairs = applyMove([], objects, on.ops).chairs;
    expect(chairs).toEqual([thing("t:1:0", "bloem")]);
    // The object on the chair is found by its id as well.
    const off = planMove(chairs, objects, { object: "bloem" }, { point: { x: 60, y: 60 } });
    expect(off.kind).toBe("moved");
    if (off.kind === "none") return;
    const after = applyMove(chairs, objects, off.ops);
    expect(after.chairs).toEqual([]);
    expect(after.objects[0]).toMatchObject({ x: 60, y: 60 });
  });

  it("swaps an object on a chair with a loose object", () => {
    const chairs = [thing("A", "vaas")];
    const objects = [{ id: "vaas", x: 1, y: 1 }, { id: "kaars", x: 40, y: 40 }];
    const plan = planMove(chairs, objects, { seat: "A" }, { object: "kaars" });
    expect(plan.kind).toBe("swapped");
    if (plan.kind === "none") return;
    const after = applyMove(chairs, objects, plan.ops);
    expect(after.chairs).toEqual([thing("A", "kaars")]);
    expect(after.objects.find((o) => o.id === "vaas")).toMatchObject({ x: 40, y: 40 });
  });

  it("never leaves a guest loose on the plan", () => {
    const chairs = [guest("A", "anna")];
    expect(planMove(chairs, [], { seat: "A" }, { point: { x: 5, y: 5 } }).kind).toBe("none");
    expect(planMove(chairs, [{ id: "o", x: 1, y: 1 }], { object: "o" }, { seat: "A" }).kind).toBe("none");
    expect(planMove(chairs, [{ id: "o", x: 1, y: 1 }], { seat: "A" }, { object: "o" }).kind).toBe("none");
  });

  it("does nothing for an empty chair or the same place", () => {
    expect(planMove([], [], { seat: "A" }, { seat: "B" }).kind).toBe("none");
    expect(planMove([guest("A", "anna")], [], { seat: "A" }, { seat: "A" }).kind).toBe("none");
  });

  it("writes the message", () => {
    expect(moveMessage("swapped", "Anna", "Mark")).toBe("Anna en Mark zijn van plek gewisseld");
    expect(moveMessage("moved", "Anna")).toBe("Anna is verplaatst");
  });

  it("names objects", () => {
    expect(objectLabel("babs", "")).toBe("BABS");
    expect(objectLabel("music", "Piano")).toBe("Piano");
    expect(objectLabel("signing", " ")).toBe("Tekentafel");
    expect(objectLabel("styling", "Bloemstuk")).toBe("Bloemstuk");
  });
});

describe("Opstelling: stoelen per rij", () => {
  it("uses the old number of chairs per row for plans without their own rows", () => {
    expect(ceremonyRows({ shape: "rows", rows: 3, seats_per_row: 4 })).toEqual([{ left: 4, right: 4 }, { left: 4, right: 4 }, { left: 4, right: 4 }]);
    expect(ceremonyRows({ shape: "rows", rows: 3, seats_per_row: 4, row_seats: [{ left: 2, right: 5 }] })).toEqual([{ left: 2, right: 5 }]);
  });

  it("lays out rows of different lengths from the aisle", () => {
    const rows = [{ left: 6, right: 6 }, { left: 3, right: 4 }, { left: 0, right: 2 }];
    const spots = ceremonySeats({ shape: "rows", rows: 3, seats_per_row: 6, row_seats: rows });
    expect(spots).toHaveLength(21);
    const row = (r: number, side: "L" | "R") => spots.filter((s) => s.key.startsWith(`${side}:${r}:`));
    expect(row(1, "L")).toHaveLength(3);
    expect(row(1, "R")).toHaveLength(4);
    // Chair 0 is next to the aisle in every row, so a shorter row is centred on the aisle side.
    expect(row(1, "L")[0].x).toBe(row(0, "L")[0].x);
    expect(row(1, "R")[0].x).toBe(row(0, "R")[0].x);
    expect(Math.min(...row(1, "L").map((s) => s.x))).toBeGreaterThan(Math.min(...row(0, "L").map((s) => s.x)));
    expect(row(2, "L")).toHaveLength(0);
  });

  it("cleans up and evens out rows", () => {
    expect(cleanRows([{ left: -2, right: 99 }, { left: "3", right: 2.6 }])).toEqual([{ left: 0, right: 40 }, { left: 3, right: 3 }]);
    expect(cleanRows("nee")).toEqual([]);
    expect(evenRows(2, 5, 4)).toEqual([{ left: 5, right: 4 }, { left: 5, right: 4 }]);
    expect(rowSeatKeys([{ left: 1, right: 2 }])).toEqual(["L:0:0", "R:0:0", "R:0:1"]);
  });

  it("finds the taken chairs that disappear", () => {
    const before = [{ left: 4, right: 4 }, { left: 4, right: 4 }];
    const after = [{ left: 4, right: 2 }, { left: 4, right: 4 }];
    expect(rowChange(before, after, ["R:0:1", "R:0:3", "L:1:0", "t:x:1"])).toEqual({ moves: [], lost: ["R:0:3"] });
  });

  it("moves the guests of the rows behind a removed row up", () => {
    expect(keyAfterRowRemoval("L:0:2", 1)).toBe("L:0:2");
    expect(keyAfterRowRemoval("L:1:2", 1)).toBeNull();
    expect(keyAfterRowRemoval("R:3:0", 1)).toBe("R:2:0");
    const before = [{ left: 2, right: 2 }, { left: 2, right: 2 }, { left: 2, right: 2 }, { left: 2, right: 2 }];
    const after = before.filter((_, i) => i !== 1);
    const change = rowChange(before, after, ["L:3:1", "L:1:0", "R:2:1", "L:0:0"], 1);
    expect(change.lost).toEqual(["L:1:0"]);
    // Lowest rows first, so no key lands on a chair still in use.
    expect(change.moves).toEqual([{ from: "R:2:1", to: "R:1:1" }, { from: "L:3:1", to: "L:2:1" }]);
  });
});
