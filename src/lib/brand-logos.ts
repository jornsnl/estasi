import "server-only";
import sharp from "sharp";
import { getFiles } from "@/lib/data";
import { one, query } from "@/lib/db";
import { LOGO_KINDS, type LogoKind } from "./brand-logo-urls";

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

const EMPTY: BrandLogos = { academy: null, estasi: null, app: null };

let cache: { at: number; logos: BrandLogos } | null = null;

export async function getBrandLogos(): Promise<BrandLogos> {
  if (cache && Date.now() - cache.at < 30_000) return cache.logos;
  const row = await one<{ academy_file_id: string | null; estasi_file_id: string | null; app_file_id: string | null }>(
    "select academy_file_id, estasi_file_id, app_file_id from public.brand_logos where id",
  ).catch(() => null);
  const logos = row ? { academy: row.academy_file_id, estasi: row.estasi_file_id, app: row.app_file_id } : EMPTY;
  cache = { at: Date.now(), logos };
  return logos;
}

export async function saveBrandLogos(logos: BrandLogos): Promise<void> {
  await query(
    `insert into public.brand_logos (id, academy_file_id, estasi_file_id, app_file_id, updated_at) values (true, $1, $2, $3, now())
     on conflict (id) do update set academy_file_id = $1, estasi_file_id = $2, app_file_id = $3, updated_at = now()`,
    [logos.academy, logos.estasi, logos.app],
  );
  cache = null;
  rendered.clear();
}

/**
 * The pngs made from a logo:
 *   icon-N:     square app icon of N pixels, the logo on white with some room around it
 *               (white, because iOS fills transparent icons with black)
 *   maskable:   512 pixels with extra room, for Android icons cut to a circle or rounded square
 *   mail:       the logo itself, at most 480 by 160 pixels (shown at half size, sharp on retina)
 */
export const LOGO_VARIANTS = ["icon-32", "icon-180", "icon-192", "icon-512", "maskable", "mail"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

const rendered = new Map<string, Buffer>();

export async function renderLogo(fileId: string, variant: LogoVariant): Promise<Buffer | null> {
  const key = `${fileId}:${variant}`;
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
    // The logo fills 80% of an icon, 60% of a maskable one (its safe zone is the inner 80% circle).
    const inner = Math.round(size * (variant === "maskable" ? 0.6 : size <= 32 ? 0.94 : 0.8));
    const logo = await input().resize({ width: inner, height: inner, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    png = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{ input: logo, gravity: "centre" }])
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
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
