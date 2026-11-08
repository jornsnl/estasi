/**
 * Where every chair is on a seating plan. The plan is a logical canvas of
 * 1000 by 650; the page scales it to the screen. No server imports: used by
 * the editor in the browser and by the tests.
 */

export const CANVAS = { w: 1000, h: 650 };
export const SEAT = { w: 84, h: 28 };

export interface TableShape {
  id: string;
  shape: "round" | "square" | "long";
  x: number;
  y: number;
  rotation: number;
  seats: number;
  long_sides: "both" | "one";
  head_seats: boolean;
}

export interface SeatSpot {
  key: string;
  /** Centre of the chair on the canvas. */
  x: number;
  y: number;
  side?: "left" | "right";
}

/** Size of the table top on the canvas (before rotation). */
export function tableSize(t: Pick<TableShape, "shape" | "seats" | "long_sides" | "head_seats">): { w: number; h: number } {
  if (t.shape === "round") {
    const d = Math.max(70, t.seats * 13);
    return { w: d, h: d };
  }
  if (t.shape === "square") {
    const s = Math.max(70, Math.ceil(t.seats / 4) * 40);
    return { w: s, h: s };
  }
  const heads = t.head_seats ? Math.min(2, t.seats) : 0;
  const perSide = Math.ceil((t.seats - heads) / (t.long_sides === "both" ? 2 : 1));
  return { w: Math.max(100, perSide * (SEAT.w + 6)), h: 46 };
}

/** The chairs around a dinner table, keyed t:<table id>:<n>. */
export function tableSeats(t: TableShape): SeatSpot[] {
  const cx = (t.x / 100) * CANVAS.w;
  const cy = (t.y / 100) * CANVAS.h;
  const { w, h } = tableSize(t);
  const spots: { dx: number; dy: number }[] = [];
  if (t.shape === "round") {
    const r = w / 2 + 20;
    for (let i = 0; i < t.seats; i++) {
      const a = -Math.PI / 2 + (i / t.seats) * Math.PI * 2;
      spots.push({ dx: Math.cos(a) * (r + 18), dy: Math.sin(a) * (r - 4) });
    }
  } else if (t.shape === "square") {
    const perSide = Math.ceil(t.seats / 4);
    const sides = [
      (i: number, n: number) => ({ dx: -w / 2 + ((i + 0.5) / n) * w, dy: -h / 2 - 16 }),
      (i: number, n: number) => ({ dx: w / 2 + SEAT.w / 2 + 4, dy: -h / 2 + ((i + 0.5) / n) * h }),
      (i: number, n: number) => ({ dx: w / 2 - ((i + 0.5) / n) * w, dy: h / 2 + 16 }),
      (i: number, n: number) => ({ dx: -w / 2 - SEAT.w / 2 - 4, dy: h / 2 - ((i + 0.5) / n) * h }),
    ];
    let left = t.seats;
    for (let s = 0; s < 4 && left > 0; s++) {
      const n = Math.min(perSide, left);
      for (let i = 0; i < n; i++) spots.push(sides[s](i, n));
      left -= n;
    }
  } else {
    const heads = t.head_seats ? Math.min(2, t.seats) : 0;
    const rest = t.seats - heads;
    const both = t.long_sides === "both";
    const top = both ? Math.ceil(rest / 2) : rest;
    const bottom = rest - top;
    for (let i = 0; i < top; i++) spots.push({ dx: -w / 2 + ((i + 0.5) / top) * w, dy: -h / 2 - 16 });
    for (let i = 0; i < bottom; i++) spots.push({ dx: -w / 2 + ((i + 0.5) / bottom) * w, dy: h / 2 + 16 });
    if (heads >= 1) spots.push({ dx: -w / 2 - SEAT.w / 2 - 6, dy: 0 });
    if (heads >= 2) spots.push({ dx: w / 2 + SEAT.w / 2 + 6, dy: 0 });
  }
  const turned = t.rotation === 90;
  return spots.map((s, i) => ({ key: `t:${t.id}:${i}`, x: cx + (turned ? -s.dy : s.dx), y: cy + (turned ? s.dx : s.dy) }));
}

/** Chairs in one ceremony row, on each side of the aisle. */
export interface RowSeats {
  left: number;
  right: number;
}

export interface CeremonyShape {
  shape: "rows" | "half" | "circle";
  rows: number;
  seats_per_row: number;
  /** Rows with an aisle: chairs per row and side. Empty for plans made before this existed. */
  row_seats?: RowSeats[];
}

export const MAX_ROWS = 40;
export const MAX_SIDE = 40;
const side = (n: unknown) => Math.max(0, Math.min(MAX_SIDE, Math.round(Number(n)) || 0));

/** Cleans up rows from a form or a client: whole numbers, 0 to 40 per side, 1 to 40 rows. */
export function cleanRows(rows: unknown): RowSeats[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_ROWS).map((r) => ({ left: side((r as RowSeats)?.left), right: side((r as RowSeats)?.right) }));
}

/** The rows of a ceremony with an aisle; plans without their own rows get the same number everywhere. */
export function ceremonyRows(c: CeremonyShape): RowSeats[] {
  const own = cleanRows(c.row_seats);
  if (own.length) return own;
  return Array.from({ length: Math.max(1, c.rows) }, () => ({ left: c.seats_per_row, right: c.seats_per_row }));
}

/** "Alle rijen gelijk": every row the same. */
export const evenRows = (count: number, left: number, right: number): RowSeats[] =>
  cleanRows(Array.from({ length: Math.max(1, Math.min(MAX_ROWS, count)) }, () => ({ left, right })));

/** The chair keys of rows with an aisle: L:<row>:<n> and R:<row>:<n>, n = 0 next to the aisle. */
export function rowSeatKeys(rows: RowSeats[]): string[] {
  return rows.flatMap((r, i) => [
    ...Array.from({ length: r.left }, (_, n) => `L:${i}:${n}`),
    ...Array.from({ length: r.right }, (_, n) => `R:${i}:${n}`),
  ]);
}

/**
 * Where the chairs of rows with an aisle go when row `removed` is taken out:
 * the rows behind it move up one. Returns the new key, or null for a chair
 * that no longer exists. Other keys stay the same.
 */
export function keyAfterRowRemoval(key: string, removed: number): string | null {
  const m = /^([LR]):(\d+):(\d+)$/.exec(key);
  if (!m) return key;
  const row = Number(m[2]);
  if (row < removed) return key;
  if (row === removed) return null;
  return `${m[1]}:${row - 1}:${m[3]}`;
}

/**
 * The changes to the placed chairs when the rows change from `before` to
 * `after` (optionally by taking out row `removed`): which keys move and which
 * placed chairs disappear.
 */
export function rowChange(before: RowSeats[], after: RowSeats[], placed: string[], removed?: number) {
  const exists = new Set(rowSeatKeys(after));
  const moves: { from: string; to: string }[] = [];
  const lost: string[] = [];
  for (const key of placed) {
    if (!/^[LR]:/.test(key)) continue;
    const to = removed === undefined ? key : keyAfterRowRemoval(key, removed);
    if (to === null || !exists.has(to)) lost.push(key);
    else if (to !== key) moves.push({ from: key, to });
  }
  // Rows move up, so the lowest keys go first and never land on a chair still in use.
  moves.sort((a, b) => Number(a.from.split(":")[1]) - Number(b.from.split(":")[1]));
  return { moves, lost };
}

/** The couple and the ceremony: a fixed box. */
export function ceremonyFront(c: CeremonyShape): { x: number; y: number; w: number; h: number } {
  if (c.shape === "circle") return { x: CANVAS.w / 2, y: CANVAS.h / 2, w: 150, h: 60 };
  return { x: CANVAS.w / 2, y: 50, w: 220, h: 50 };
}

/** The chairs of a ceremony: rows left and right of an aisle, a half circle or a circle. */
export function ceremonySeats(c: CeremonyShape): SeatSpot[] {
  const spots: SeatSpot[] = [];
  if (c.shape === "rows") {
    // Shorter rows are shorter on the plan: chair 0 is always next to the aisle.
    const rows = ceremonyRows(c);
    const gap = 90;
    const widest = Math.max(1, ...rows.map((r) => Math.max(r.left, r.right)));
    const spacing = Math.min(SEAT.w + 6, (CANVAS.w / 2 - gap / 2 - 20) / widest);
    const rowGap = Math.min(48, (CANVAS.h - 130) / rows.length);
    rows.forEach((row, r) => {
      const y = 120 + r * rowGap;
      for (let i = 0; i < row.left; i++) spots.push({ key: `L:${r}:${i}`, x: CANVAS.w / 2 - gap / 2 - (i + 0.5) * spacing, y, side: "left" });
      for (let i = 0; i < row.right; i++) spots.push({ key: `R:${r}:${i}`, x: CANVAS.w / 2 + gap / 2 + (i + 0.5) * spacing, y, side: "right" });
    });
    return spots;
  }
  const front = ceremonyFront(c);
  for (let r = 0; r < c.rows; r++) {
    const n = Math.max(1, Math.round(c.seats_per_row * (1 + r * (c.shape === "circle" ? 0.45 : 0.3))));
    if (c.shape === "half") {
      const radius = 120 + r * 52;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.08 + (0.84 * (i + 0.5)) / n);
        spots.push({ key: `H:${r}:${i}`, x: front.x - Math.cos(a) * radius * 1.6, y: front.y + Math.sin(a) * radius, side: a > Math.PI / 2 ? "right" : "left" });
      }
    } else {
      const radius = 95 + r * 46;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        spots.push({ key: `C:${r}:${i}`, x: front.x + Math.cos(a) * radius * 1.7, y: front.y + Math.sin(a) * radius });
      }
    }
  }
  return spots;
}
