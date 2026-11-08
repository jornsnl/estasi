/**
 * Ordering and showing packages, kept free of server imports so it is unit tested.
 */

export interface Positioned {
  id: string;
  position: number;
}

/**
 * Moves one row up, down or to an index within the given rows (in their
 * current order). The rows keep their own position values, handed out again
 * in the new order, so rows outside the list (other kinds of package) do not
 * move; ties or gaps become 1..n when the values are not unique. Returns only
 * the rows whose position changes, or null when nothing moves.
 */
export function reorder(rows: Positioned[], id: string, to: "up" | "down" | number): Positioned[] | null {
  const from = rows.findIndex((r) => r.id === id);
  if (from === -1) return null;
  const target = to === "up" ? from - 1 : to === "down" ? from + 1 : Math.round(to);
  if (!Number.isFinite(target) || target < 0 || target >= rows.length || target === from) return null;
  const sorted = rows.map((r) => r.position).sort((a, b) => a - b);
  const unique = new Set(sorted).size === sorted.length;
  const slots = unique ? sorted : rows.map((_, i) => i + 1);
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  const changes = next.map((r, i) => ({ id: r.id, position: slots[i] })).filter((r, i) => r.position !== next[i].position);
  return changes.length ? changes : null;
}

/** "Openingsdans: Our Song" is shown as "Our Song" on the dance page. */
export const danceName = (name: string) => name.replace(/^Openingsdans:\s*/i, "").trim() || name;

/** The contents of a package card: one item per line of the description, else the addition. */
export function offerLines(description: string, variant = ""): string[] {
  const lines = description
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]\s*)/, "").trim())
    .filter(Boolean);
  return lines.length ? lines : variant.trim() ? [variant.trim()] : [];
}
