/**
 * Colour helpers for the palette in the styling plan (pure, also used in the
 * browser by the colour picker).
 */

export interface Hsv {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

export interface PaletteColor {
  hex: string;
  name: string;
}

/** "#AbC", "abc", "#aabbcc" -> "#aabbcc"; null when it is not a hex colour. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw.split("").map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

export function hexToHsv(hex: string): Hsv {
  const n = normalizeHex(hex) ?? "#000000";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Light colours get dark text on top, dark colours white text. */
export function isLight(hex: string): boolean {
  const n = normalizeHex(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/**
 * The palette as stored: hex codes in order (styling_plans.colors) plus a name
 * per hex code (styling_plans.color_names). Unknown entries are skipped.
 */
export function readPalette(colors: unknown, names: unknown): PaletteColor[] {
  const map = names && typeof names === "object" && !Array.isArray(names) ? (names as Record<string, unknown>) : {};
  return (Array.isArray(colors) ? colors : [])
    .map((c) => normalizeHex(String(c)))
    .filter((c): c is string => Boolean(c))
    .map((hex) => ({ hex, name: typeof map[hex] === "string" ? String(map[hex]).trim().slice(0, 40) : "" }));
}

/** The other way round: what goes into the two columns. At most `max` colours, no duplicates. */
export function writePalette(palette: PaletteColor[], max = 12): { colors: string[]; names: Record<string, string> } {
  const colors: string[] = [];
  const names: Record<string, string> = {};
  for (const p of palette) {
    const hex = normalizeHex(p.hex);
    if (!hex || colors.includes(hex) || colors.length >= max) continue;
    colors.push(hex);
    const name = (p.name ?? "").trim().slice(0, 40);
    if (name) names[hex] = name;
  }
  return { colors, names };
}

/** Suggestions in the picker: colours that are often used at weddings. */
export const WEDDING_COLORS: PaletteColor[] = [
  { hex: "#f5f0e8", name: "Crème" },
  { hex: "#fffaf0", name: "Ivoor" },
  { hex: "#e8d5c4", name: "Champagne" },
  { hex: "#d8a7a7", name: "Oudroze" },
  { hex: "#f2c4c4", name: "Blush" },
  { hex: "#c98b6b", name: "Terracotta" },
  { hex: "#a89650", name: "Goud" },
  { hex: "#9caf88", name: "Saliegroen" },
  { hex: "#7e9c86", name: "Eucalyptus" },
  { hex: "#556b2f", name: "Olijfgroen" },
  { hex: "#a7c4d9", name: "Stofblauw" },
  { hex: "#1f3a5f", name: "Navy" },
  { hex: "#b9a7c9", name: "Lavendel" },
  { hex: "#6b1e2e", name: "Bordeaux" },
  { hex: "#8a8578", name: "Taupe" },
  { hex: "#2c2c2c", name: "Antraciet" },
];
