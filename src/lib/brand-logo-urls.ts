/**
 * Where Sabine's logos are served (src/app/api/logo), kept free of server imports
 * for the manifests and the metadata of the layouts. See src/lib/brand-logos.ts.
 */
export const LOGO_KINDS = ["academy", "estasi", "app"] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

/** The icons of a web app manifest, made from one logo. */
export const manifestIcons = (kind: LogoKind) => [
  { src: `/api/logo/${kind}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: `/api/logo/${kind}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
  { src: `/api/logo/${kind}/maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  { src: `/api/logo/${kind}/icon-180.png`, sizes: "180x180", type: "image/png" },
];

/** The favicon and home screen icon of a layout (Next metadata `icons`). */
export const metadataIcons = (kind: LogoKind) => ({
  icon: [{ url: `/api/logo/${kind}/icon-32.png`, sizes: "32x32", type: "image/png" }, { url: `/api/logo/${kind}/icon-192.png`, sizes: "192x192", type: "image/png" }],
  apple: [{ url: `/api/logo/${kind}/icon-180.png`, sizes: "180x180", type: "image/png" }],
});

/**
 * The crop of an app icon (feedback Sabine, migration 0039): zoom is the size of the logo in the
 * square (1 = edge to edge, more cuts it off), x and y move it, as a fraction of the icon.
 * Shared by the crop tool in the browser and the pngs made on the server.
 */
export interface LogoCrop {
  zoom: number;
  x: number;
  y: number;
}

export const DEFAULT_CROP: LogoCrop = { zoom: 0.8, x: 0, y: 0 };
export const CROP_ZOOM = { min: 0.4, max: 3 } as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function normaliseCrop(value: unknown): LogoCrop {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? n : typeof n === "string" && n.trim() && Number.isFinite(Number(n)) ? Number(n) : fallback);
  return {
    zoom: Math.round(clamp(num(v.zoom, DEFAULT_CROP.zoom), CROP_ZOOM.min, CROP_ZOOM.max) * 1000) / 1000,
    x: Math.round(clamp(num(v.x, 0), -1, 1) * 1000) / 1000,
    y: Math.round(clamp(num(v.y, 0), -1, 1) * 1000) / 1000,
  };
}

/** "zoom,x,y" from the hidden field of the crop tool. */
export function parseCrop(text: string): LogoCrop | null {
  const parts = text.split(",").map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !p || !Number.isFinite(Number(p)))) return null;
  return normaliseCrop({ zoom: parts[0], x: parts[1], y: parts[2] });
}

export const cropKey = (crop: LogoCrop) => `${crop.zoom}_${crop.x}_${crop.y}`;
