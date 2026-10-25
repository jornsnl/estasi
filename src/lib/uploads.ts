import "server-only";
import { getFiles, type FileRef } from "@/lib/data";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "webp", "heic"]);

export const ACCEPT_ATTR = [...ALLOWED].map((ext) => `.${ext}`).join(",");

export class UploadError extends Error {}

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
