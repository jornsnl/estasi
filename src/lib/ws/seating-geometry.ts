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

export interface CeremonyShape {
  shape: "rows" | "half" | "circle";
  rows: number;
  seats_per_row: number;
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
    const gap = 90;
    const spacing = Math.min(SEAT.w + 6, (CANVAS.w / 2 - gap / 2 - 20) / c.seats_per_row);
    const rowGap = Math.min(48, (CANVAS.h - 130) / c.rows);
    for (let r = 0; r < c.rows; r++) {
      const y = 120 + r * rowGap;
      for (let i = 0; i < c.seats_per_row; i++) {
        spots.push({ key: `L:${r}:${i}`, x: CANVAS.w / 2 - gap / 2 - (i + 0.5) * spacing, y, side: "left" });
        spots.push({ key: `R:${r}:${i}`, x: CANVAS.w / 2 + gap / 2 + (i + 0.5) * spacing, y, side: "right" });
      }
    }
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
