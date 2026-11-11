import "server-only";
import sharp from "sharp";
import { getFiles } from "@/lib/data";
import { one, query } from "@/lib/db";
import { cropKey, DEFAULT_CROP, LOGO_KINDS, normaliseCrop, type LogoCrop, type LogoKind } from "./brand-logo-urls";

/**
 * Sabine's own logos (feedback Sabine, migration 0036), in place of the bordeaux E:
 *   academy: Future Weddings Academy, what students see in their mails and as app icon
 *   estasi:  Estasi Weddings, what couples see in their mails and as app icon
 *   app:     the icon of the beheer app on her own home screen
 * Uploaded as SVG, png or jpg. Mail clients and home screens want a png, so every use gets
 * its own png made from the upload (sharp, which reads SVG too).
 */
export { LOGO_KINDS, type LogoKind } from "./brand-logo-urls";

export const LOGO_LABELS: Record<LogoKind, string> = {
  academy: "Logo Future Weddings Academy",
  estasi: "Logo Estasi Weddings",
  app: "Logo van de app",
};

export type BrandLogos = Record<LogoKind, string | null>;
export type LogoCrops = Record<LogoKind, LogoCrop>;

const EMPTY: BrandLogos = { academy: null, estasi: null, app: null };
const DEFAULT_CROPS: LogoCrops = { academy: DEFAULT_CROP, estasi: DEFAULT_CROP, app: DEFAULT_CROP };

let cache: { at: number; logos: BrandLogos; crops: LogoCrops } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  const row = await one<{ academy_file_id: string | null; estasi_file_id: string | null; app_file_id: string | null; crops: Record<string, unknown> | null }>(
    "select academy_file_id, estasi_file_id, app_file_id, crops from public.brand_logos where id",
  ).catch(() => null);
  const logos = row ? { academy: row.academy_file_id, estasi: row.estasi_file_id, app: row.app_file_id } : EMPTY;
  const crops = row?.crops
    ? (Object.fromEntries(LOGO_KINDS.map((k) => [k, row.crops?.[k] ? normaliseCrop(row.crops[k]) : DEFAULT_CROP])) as LogoCrops)
    : DEFAULT_CROPS;
  cache = { at: Date.now(), logos, crops };
  return cache;
}

export async function getBrandLogos(): Promise<BrandLogos> {
  return { ...(await load()).logos };
}

/** The crop Sabine chose for each app icon (feedback Sabine, migration 0039). */
export async function getLogoCrops(): Promise<LogoCrops> {
  return { ...(await load()).crops };
}

export async function saveBrandLogos(logos: BrandLogos, crops?: LogoCrops): Promise<void> {
  await query(
    `insert into public.brand_logos (id, academy_file_id, estasi_file_id, app_file_id, crops, updated_at) values (true, $1, $2, $3, coalesce($4::jsonb, '{}'::jsonb), now())
     on conflict (id) do update set academy_file_id = $1, estasi_file_id = $2, app_file_id = $3, crops = coalesce($4::jsonb, public.brand_logos.crops), updated_at = now()`,
    [logos.academy, logos.estasi, logos.app, crops ? JSON.stringify(crops) : null],
  );
  cache = null;
  rendered.clear();
}

/**
 * The pngs made from a logo:
 *   icon-N:     square app icon of N pixels, the logo on white, cut out the way Sabine chose
 *               (zoom and position, LogoCrop; white, because iOS fills transparent icons with black)
 *   maskable:   512 pixels with extra room, for Android icons cut to a circle or rounded square
 *   mail:       the logo itself, at most 480 by 160 pixels (shown at half size, sharp on retina)
 */
export const LOGO_VARIANTS = ["icon-32", "icon-180", "icon-192", "icon-512", "maskable", "mail"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

const rendered = new Map<string, Buffer>();

export async function renderLogo(fileId: string, variant: LogoVariant, crop: LogoCrop = DEFAULT_CROP): Promise<Buffer | null> {
  const key = `${fileId}:${variant}:${cropKey(crop)}`;
  const hit = rendered.get(key);
  if (hit) return hit;
  const file = await getFiles().read(fileId);
  if (!file || !file.meta.mime.startsWith("image/")) return null;
  // A high density, so a small SVG still turns into a sharp png.
  const input = () => sharp(file.data, { density: file.meta.mime === "image/svg+xml" ? 400 : 72 });
  let png: Buffer;
  if (variant === "mail") {
    png = await input().resize({ width: 480, height: 160, fit: "inside", withoutEnlargement: file.meta.mime !== "image/svg+xml" }).png().toBuffer();
  } else {
    const size = variant === "maskable" ? 512 : Number(variant.slice(5));
    // The chosen crop; a maskable icon keeps three quarters of it (its safe zone is the inner 80% circle).
    const zoom = variant === "maskable" ? crop.zoom * 0.75 : crop.zoom;
    const inner = Math.max(1, Math.round(size * zoom));
    const logo = await input().resize({ width: inner, height: inner, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    // Put the logo on a transparent sheet with an icon of room on every side, then cut the icon out
    // of it: that way a logo larger than the icon (zoom above 1) or moved aside is simply cropped.
    const left = Math.round((size - inner) / 2 + crop.x * size);
    const top = Math.round((size - inner) / 2 + crop.y * size);
    const sheet = inner + 2 * size;
    const placed = await sharp({ create: { width: sheet, height: sheet, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: logo, left: size, top: size }])
      .png()
      .toBuffer();
    const cx = Math.min(sheet - size, Math.max(0, size - left));
    const cy = Math.min(sheet - size, Math.max(0, size - top));
    png = await sharp(placed).extract({ left: cx, top: cy, width: size, height: size }).flatten({ background: "#ffffff" }).png().toBuffer();
  }
  if (rendered.size > 60) rendered.clear();
  rendered.set(key, png);
  return png;
}

/** True when the file is one of the logos, so the public may see it. */
export async function isBrandLogo(fileId: string): Promise<boolean> {
  const logos = await getBrandLogos();
  return LOGO_KINDS.some((k) => logos[k] === fileId);
}


/** The logo in the header of a mail: the Academy logo for students, Estasi for everyone else. */
export async function mailLogo(brand: "academy" | "wedding-space" | "estasi", baseUrl: string) {
  const kind: LogoKind = brand === "academy" ? "academy" : "estasi";
  const fileId = (await getBrandLogos())[kind];
  if (!fileId || !/^https:\/\//.test(baseUrl)) return undefined;
  const png = await renderLogo(fileId, "mail").catch(() => null);
  if (!png) return undefined;
  const { width = 0, height = 0 } = await sharp(png).metadata();
  if (!width || !height) return undefined;
  // The png is made at twice the size it is shown; the file id in the address skips old copies in caches.
  return { url: `${baseUrl}/api/logo/${kind}/mail.png?v=${fileId.slice(0, 8)}`, width: width / 2, height: height / 2 };
}

/** The address of the Academy logo as uploaded, for the certificates (feedback Sabine 26), or null. */
export async function academyLogoSrc(): Promise<string | null> {
  const fileId = (await getBrandLogos().catch(() => EMPTY)).academy;
  return fileId ? `/api/logo/academy/original?v=${fileId.slice(0, 8)}` : null;
}
