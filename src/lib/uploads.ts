import "server-only";
import { getFiles, type FileRef } from "@/lib/data";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "webp", "heic"]);

export const ACCEPT_ATTR = [...ALLOWED].map((ext) => `.${ext}`).join(",");

export class UploadError extends Error {}

/** Pictures in lessons: only formats every browser shows (no svg, which can carry script). */
const IMAGE_TYPES: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
};

export const IMAGE_ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/gif";

/** Like storeUpload, but only accepts pictures (lesson images); stored as course material. */
export async function storeImageUpload(value: FormDataEntryValue | null, uploadedBy: string): Promise<FileRef | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
  const mimes = IMAGE_TYPES[ext];
  if (!mimes || (value.type && !mimes.includes(value.type))) {
    throw new UploadError("Alleen afbeeldingen (jpg, png, webp of gif) zijn toegestaan.");
  }
  if (value.size > MAX_UPLOAD_BYTES) throw new UploadError("Afbeelding is groter dan 10 MB.");
  const data = Buffer.from(await value.arrayBuffer());
  return getFiles().save(data, { name: value.name.slice(0, 200), mime: mimes[0], belongsTo: null, uploadedBy });
}

/** Validates and stores an uploaded file; returns null when the field was empty. */
export async function storeUpload(
  value: FormDataEntryValue | null,
  owner: { belongsTo: string | null; uploadedBy: string },
): Promise<FileRef | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.has(ext)) throw new UploadError(`Bestandstype .${ext} is niet toegestaan.`);
  if (value.size > MAX_UPLOAD_BYTES) throw new UploadError("Bestand is groter dan 10 MB.");
  const data = Buffer.from(await value.arrayBuffer());
  return getFiles().save(data, { name: value.name.slice(0, 200), mime: value.type, ...owner });
}

/**
 * The logo of the public sign up page: an image or an SVG (Sabine's logo is an SVG). An SVG can carry
 * script, so it is only ever shown through an <img> and served with a sandboxing policy
 * (src/app/api/inschrijven/foto/[id]).
 */
export async function storeLogoUpload(value: FormDataEntryValue | null, uploadedBy: string): Promise<FileRef | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext !== "svg") return storeImageUpload(value, uploadedBy);
  if (value.size > 2 * 1024 * 1024) throw new UploadError("Het logo is groter dan 2 MB.");
  const data = Buffer.from(await value.arrayBuffer());
  if (!/<svg[\s>]/i.test(data.toString("utf8", 0, Math.min(data.length, 4096)))) throw new UploadError("Dit lijkt geen geldig SVG-bestand.");
  return getFiles().save(data, { name: value.name.slice(0, 200), mime: "image/svg+xml", belongsTo: null, uploadedBy });
}

/**
 * Sabine's own logos (Instellingen, Logo's): SVG, png or jpg, at most 5 MB. An SVG is checked to
 * be one; it is only ever shown through an <img> or turned into a png (src/lib/brand-logos.ts).
 */
export async function storeBrandLogoUpload(value: FormDataEntryValue | null, uploadedBy: string): Promise<FileRef | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "";
  if (!mime || (value.type && value.type !== mime && !(mime === "image/svg+xml" && value.type === "text/xml"))) {
    throw new UploadError("Een logo mag een SVG, png of jpg zijn.");
  }
  if (value.size > 5 * 1024 * 1024) throw new UploadError("Het logo is groter dan 5 MB.");
  const data = Buffer.from(await value.arrayBuffer());
  if (mime === "image/svg+xml" && !/<svg[\s>]/i.test(data.toString("utf8", 0, Math.min(data.length, 4096)))) {
    throw new UploadError("Dit lijkt geen geldig SVG-bestand.");
  }
  return getFiles().save(data, { name: value.name.slice(0, 200), mime, belongsTo: null, uploadedBy });
}

export const BRAND_LOGO_ACCEPT_ATTR = "image/svg+xml,.svg,image/png,.png,image/jpeg,.jpg,.jpeg";
