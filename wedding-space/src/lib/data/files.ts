import "server-only";
import type pg from "pg";
import { one, pool } from "@/lib/db";
import type { FileRef } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const DOCUMENTS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "webp", "heic"];
const IMAGES = ["jpg", "jpeg", "png", "webp"];

export const DOCUMENT_ACCEPT = DOCUMENTS.map((e) => `.${e}`).join(",");
export const IMAGE_ACCEPT = IMAGES.map((e) => `.${e}`).join(",");

export class UploadError extends Error {}

/**
 * Stores an uploaded file in the database, owned by a couple. Returns null
 * when the field was left empty.
 */
export async function storeUpload(
  value: FormDataEntryValue | null,
  owner: { coupleId: string | null; accountId: string; images?: boolean },
  db: Pick<pg.Pool, "query"> = pool(),
): Promise<FileRef | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = owner.images ? IMAGES : DOCUMENTS;
  if (!allowed.includes(ext)) throw new UploadError(`Bestandstype .${ext} is hier niet toegestaan.`);
  if (value.size > MAX_UPLOAD_BYTES) throw new UploadError("Bestand is groter dan 10 MB.");
  const data = Buffer.from(await value.arrayBuffer());
  const row = await one<FileRef>(
    `insert into files (couple_id, name, mime, size, data, uploaded_by) values ($1, $2, $3, $4, $5, $6)
     returning id, name, size, mime`,
    [owner.coupleId, value.name.slice(0, 200), value.type || "application/octet-stream", data.length, data, owner.accountId],
    db,
  );
  return row;
}
