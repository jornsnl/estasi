/**
 * Moving and swapping on a seating plan, without the database: used by the
 * server action (to know what to write), by the editor (to show the result at
 * once) and by the tests.
 *
 * A chair holds a guest, a typed name or an object. An object (styling or a
 * ceremony element) is on a chair or loose on the plan at x, y (percent).
 */

export type ObjectKind = "styling" | "babs" | "music" | "signing" | "custom";

export const OBJECT_KINDS: { kind: Exclude<ObjectKind, "styling">; label: string; named: boolean }[] = [
  { kind: "babs", label: "BABS", named: false },
  { kind: "music", label: "Muziekinstrument", named: true },
  { kind: "signing", label: "Tekentafel", named: false },
  { kind: "custom", label: "Eigen blok", named: true },
];

export const isObjectKind = (v: unknown): v is ObjectKind => v === "styling" || OBJECT_KINDS.some((k) => k.kind === v);

/** What an object is called on the plan: its own name, or the name of its type. */
export function objectLabel(kind: ObjectKind, name: string): string {
  const own = name.trim();
  if (own) return own;
  if (kind === "styling") return "Styling";
  return OBJECT_KINDS.find((k) => k.kind === kind)?.label ?? "Element";
}

/** Who or what sits on a chair. */
export interface ChairRow {
  seat_key: string;
  guest_id: string | null;
  name: string;
  object_id: string | null;
}

export interface LooseObject {
  id: string;
  x: number;
  y: number;
}

/** What is being moved: whatever is on a chair, or an object. */
export type MoveSource = { seat: string } | { object: string };
/** Where it goes: a chair, the place of another object, or a point on the plan. */
export type MoveTarget = MoveSource | { point: { x: number; y: number } };

export type MoveOp =
  | { op: "chair"; key: string; occupant: Omit<ChairRow, "seat_key"> | null }
  | { op: "loose"; id: string; x: number; y: number };

export type MovePlan =
  | { kind: "moved" | "swapped"; ops: MoveOp[]; /** Who moved, and who they swapped with. */ a: Who; b?: Who }
  | { kind: "none"; reason: string };

/** A chair key, or an object id. */
export type Who = { seat: string } | { object: string };

const occupantOf = (r: ChairRow): Omit<ChairRow, "seat_key"> => ({ guest_id: r.guest_id, name: r.name, object_id: r.object_id });
const whoOf = (r: ChairRow): Who => (r.object_id ? { object: r.object_id } : { seat: r.seat_key });

/**
 * What changes when `from` is dropped on `to` (with the mouse, a finger, or
 * two clicks). An empty chair or a loose spot = move, a chair or object that is
 * taken = swap. Nothing else on the plan changes. A guest never ends up loose
 * on the plan: only objects can stand next to the chairs.
 */
export function planMove(chairs: ChairRow[], objects: LooseObject[], from: MoveSource, to: MoveTarget): MovePlan {
  const byKey = new Map(chairs.map((c) => [c.seat_key, c]));
  const chairOfObject = new Map(chairs.filter((c) => c.object_id).map((c) => [c.object_id!, c.seat_key]));
  const loose = new Map(objects.map((o) => [o.id, o]));

  // An object on a chair counts as that chair.
  const norm = <T extends MoveTarget>(p: T): MoveTarget => ("object" in p && chairOfObject.has(p.object) ? { seat: chairOfObject.get(p.object)! } : p);
  const src = norm(from) as MoveSource;
  const dst = norm(to);

  if ("seat" in src) {
    const a = byKey.get(src.seat);
    if (!a) return { kind: "none", reason: "Op deze plek staat niets." };
    if ("seat" in dst) {
      if (dst.seat === src.seat) return { kind: "none", reason: "" };
      const b = byKey.get(dst.seat);
      return {
        kind: b ? "swapped" : "moved",
        ops: [
          { op: "chair", key: dst.seat, occupant: occupantOf(a) },
          { op: "chair", key: src.seat, occupant: b ? occupantOf(b) : null },
        ],
        a: whoOf(a),
        b: b ? whoOf(b) : undefined,
      };
    }
    if (!a.object_id) return { kind: "none", reason: "Een gast kan alleen op een stoel zitten." };
    if ("point" in dst) {
      return { kind: "moved", ops: [{ op: "chair", key: src.seat, occupant: null }, { op: "loose", id: a.object_id, ...dst.point }], a: whoOf(a) };
    }
    const o = loose.get(dst.object);
    if (!o) return { kind: "none", reason: "Niet gevonden." };
    // Two objects: the one on the chair goes to the loose spot and the other way round.
    return {
      kind: "swapped",
      ops: [
        { op: "chair", key: src.seat, occupant: { guest_id: null, name: "", object_id: o.id } },
        { op: "loose", id: a.object_id, x: o.x, y: o.y },
      ],
      a: whoOf(a),
      b: { object: o.id },
    };
  }

  const o = loose.get(src.object);
  if (!o) return { kind: "none", reason: "Niet gevonden." };
  if ("point" in dst) return { kind: "moved", ops: [{ op: "loose", id: o.id, ...dst.point }], a: { object: o.id } };
  if ("object" in dst) {
    if (dst.object === o.id) return { kind: "none", reason: "" };
    const p = loose.get(dst.object);
    if (!p) return { kind: "none", reason: "Niet gevonden." };
    return {
      kind: "swapped",
      ops: [
        { op: "loose", id: o.id, x: p.x, y: p.y },
        { op: "loose", id: p.id, x: o.x, y: o.y },
      ],
      a: { object: o.id },
      b: { object: p.id },
    };
  }
  const b = byKey.get(dst.seat);
  const self = { guest_id: null, name: "", object_id: o.id };
  if (!b) return { kind: "moved", ops: [{ op: "chair", key: dst.seat, occupant: self }], a: { object: o.id } };
  if (!b.object_id) return { kind: "none", reason: "Een gast kan alleen op een stoel zitten. Zet het object eerst op een lege plek." };
  return {
    kind: "swapped",
    ops: [
      { op: "chair", key: dst.seat, occupant: self },
      { op: "loose", id: b.object_id, x: o.x, y: o.y },
    ],
    a: { object: o.id },
    b: { object: b.object_id },
  };
}

/** Applies a plan to the chairs and objects, as the editor shows it before the server answers. */
export function applyMove(chairs: ChairRow[], objects: LooseObject[], ops: MoveOp[]): { chairs: ChairRow[]; objects: LooseObject[] } {
  const keys = new Set(ops.filter((o) => o.op === "chair").map((o) => (o as { key: string }).key));
  const next = chairs.filter((c) => !keys.has(c.seat_key));
  for (const op of ops) if (op.op === "chair" && op.occupant) next.push({ seat_key: op.key, ...op.occupant });
  const moved = new Map(ops.filter((o) => o.op === "loose").map((o) => [(o as LooseObject).id, o as LooseObject]));
  return { chairs: next, objects: objects.map((o) => (moved.has(o.id) ? { ...o, x: moved.get(o.id)!.x, y: moved.get(o.id)!.y } : o)) };
}

/** The short message after a move: "Anna en Mark zijn van plek gewisseld". */
export function moveMessage(kind: "moved" | "swapped", a: string, b?: string): string {
  return kind === "swapped" && b ? `${a} en ${b} zijn van plek gewisseld` : `${a} is verplaatst`;
}
