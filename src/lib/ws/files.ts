import "server-only";
import { randomUUID } from "crypto";
import type pg from "pg";
import { adminClient } from "@/lib/supabase/server";
import { isUuid, one, pool, query } from "@/lib/ws/db";
import type { FileRef } from "@/lib/ws/types";
import { checkUpload, cleanFileName, extensionOf, mimeFor, UPLOAD_KINDS, acceptFor, type UploadKind } from "./upload-rules";

/**
 * Uploads of Your Wedding Space.
 *
 * With Supabase configured the browser uploads straight to the private
 * bucket (see prepareUpload and the FileUpload component); the form then only
 * carries the id of that upload, which storeUpload claims. Without Supabase
 * (local development) or without JavaScript the file comes along with the
 * form as before; it then goes to the bucket from the server, or into the
 * database when there is no bucket at all.
 */

export const WS_BUCKET = "wedding-space";

/** Files that come along with a form pass through the app server; keep them small. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_ACCEPT = acceptFor("document");
export const IMAGE_ACCEPT = acceptFor("image");

export class UploadError extends Error {}

/** Direct uploads need the Supabase project and its secret key. */
export const directUploads = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.WS_DIRECT_UPLOADS !== "off";

type Db = Pick<pg.Pool, "query">;
interface Owner {
  coupleId: string | null;
  accountId: string;
  /** Kept for older callers: images: true is kind "image". */
  images?: boolean;
  kind?: UploadKind;
}

const kindOf = (owner: Owner): UploadKind => owner.kind ?? (owner.images ? "image" : "document");
const storage = () => adminClient().storage.from(WS_BUCKET);

/** Everything Wedding Space keeps in Storage, together. Supabase Free has 1 GB. */
const STORAGE_BUDGET = Number(process.env.WS_STORAGE_BUDGET_BYTES) || 900 * 1024 * 1024;

async function checkBudget(extra: number, db: Db) {
  const used = await one<{ total: string }>("select coalesce(sum(size), 0)::bigint as total from files", [], db);
  if (Number(used?.total ?? 0) + extra > STORAGE_BUDGET) {
    throw new UploadError("De opslag van Your Wedding Space is bijna vol. Neem contact op met de beheerder.");
  }
}

/** Removes pending uploads that were never linked to anything (closed tab, removed from the form). */
async function cleanupPending() {
  const stale = await query<{ storage_path: string | null }>(
    `delete from files where id in (select id from files where status = 'pending' and created_at < now() - interval '1 day' limit 50)
     returning storage_path`,
  );
  await removeObjects(stale);
}

/**
 * Step 1 of a direct upload: a pending row and a one-time signed upload URL.
 * The caller has already checked that this account may upload for this couple.
 */
export async function prepareUpload(input: {
  coupleId: string | null;
  accountId: string;
  kind: UploadKind;
  name: string;
  size: number;
}): Promise<{ fileId: string; signedUrl: string; mime: string }> {
  const name = cleanFileName(input.name);
  const problem = checkUpload(input.kind, name, input.size);
  if (problem) throw new UploadError(problem);

  await cleanupPending().catch((err) => console.error(`[ws-files] opruimen mislukt: ${(err as Error).message}`));
  const recent = await one<{ n: number }>(
    "select count(*)::int as n from files where uploaded_by = $1 and status = 'pending' and created_at > now() - interval '1 hour'",
    [input.accountId],
  );
  if ((recent?.n ?? 0) >= 60) throw new UploadError("Te veel uploads tegelijk. Probeer het over een paar minuten opnieuw.");
  await checkBudget(input.size, pool());

  const id = randomUUID();
  const path = `${input.coupleId ?? "algemeen"}/${id}.${extensionOf(name)}`;
  const mime = mimeFor(extensionOf(name));
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? "geen upload-URL"}`);
  await query(
    `insert into files (id, couple_id, name, mime, size, storage_path, status, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [id, input.coupleId, name, mime, input.size, path, input.accountId],
  );
  return { fileId: id, signedUrl: data.signedUrl, mime };
}

/** Step 2 of a direct upload: the form hands back the id; check that the file really arrived. */
async function claimUpload(id: string, owner: Owner, db: Db): Promise<FileRef> {
  const row = isUuid(id)
    ? await one<FileRef & { storage_path: string }>(
        `select id, name, size, mime, storage_path from files
          where id = $1 and status = 'pending' and uploaded_by = $2 and couple_id is not distinct from $3`,
        [id, owner.accountId, owner.coupleId],
        db,
      )
    : null;
  if (!row) throw new UploadError("Deze upload is niet (meer) geldig. Kies het bestand opnieuw.");
  if (checkUpload(kindOf(owner), row.name, row.size)) throw new UploadError(`Een ${UPLOAD_KINDS[kindOf(owner)].label} hoort hier.`);

  const { data: info, error } = await storage().info(row.storage_path);
  if (error || !info) throw new UploadError(`"${row.name}" is niet goed aangekomen. Probeer het opnieuw.`);
  const meta = info as { size?: number; contentType?: string };
  if (typeof meta.size === "number" && meta.size !== row.size) {
    await removeObjects([row]);
    throw new UploadError(`"${row.name}" is niet volledig aangekomen. Probeer het opnieuw.`);
  }
  await query("update files set status = 'ready' where id = $1", [row.id], db);
  return { id: row.id, name: row.name, size: row.size, mime: row.mime };
}

/** A file that came along with the form (no JavaScript, or no direct uploads configured). */
async function storeFormFile(value: File, owner: Owner, db: Db): Promise<FileRef> {
  const name = cleanFileName(value.name);
  const problem = checkUpload(kindOf(owner), name, value.size);
  if (problem) throw new UploadError(problem);
  if (value.size > MAX_UPLOAD_BYTES) throw new UploadError("Bestand is groter dan 10 MB. Maak het kleiner of probeer een andere browser.");
  const data = Buffer.from(await value.arrayBuffer());
  const mime = mimeFor(extensionOf(name));
  await checkBudget(data.length, db);

  if (directUploads()) {
    const id = randomUUID();
    const path = `${owner.coupleId ?? "algemeen"}/${id}.${extensionOf(name)}`;
    const { error } = await storage().upload(path, data, { contentType: mime, upsert: false });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    try {
      return (await one<FileRef>(
        `insert into files (id, couple_id, name, mime, size, storage_path, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7)
         returning id, name, size, mime`,
        [id, owner.coupleId, name, mime, data.length, path, owner.accountId],
        db,
      ))!;
    } catch (err) {
      await storage().remove([path]);
      throw err;
    }
  }
  return (await one<FileRef>(
    `insert into files (couple_id, name, mime, size, data, uploaded_by) values ($1, $2, $3, $4, $5, $6)
     returning id, name, size, mime`,
    [owner.coupleId, name, mime, data.length, data, owner.accountId],
    db,
  ))!;
}

/**
 * The upload of one form field: the id of a direct upload, or a file that
 * came along with the form. Returns null when the field was left empty.
 */
export async function storeUpload(value: FormDataEntryValue | null, owner: Owner, db: Db = pool()): Promise<FileRef | null> {
  if (value === null) return null;
  if (typeof value === "string") return value.trim() ? claimUpload(value.trim(), owner, db) : null;
  if (value.size === 0) return null;
  return storeFormFile(value, owner, db);
}

/** All uploads of a field that accepts several files at once. */
export async function storeUploads(values: FormDataEntryValue[], owner: Owner, db: Db = pool()): Promise<FileRef[]> {
  const stored: FileRef[] = [];
  for (const value of values.slice(0, 30)) {
    const file = await storeUpload(value, owner, db);
    if (file) stored.push(file);
  }
  return stored;
}

async function removeObjects(rows: { storage_path?: string | null }[]) {
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length === 0 || !directUploads()) return;
  const { error } = await storage().remove(paths);
  if (error) console.error(`[ws-files] verwijderen uit Storage mislukt: ${error.message}`);
}

/**
 * Deletes file rows and their objects in Storage. The statement must be a
 * "delete from files ..." without its own returning clause.
 */
export async function deleteFiles(sql: string, params: unknown[] = [], db: Db = pool()) {
  const rows = await query<{ storage_path: string | null }>(`${sql} returning storage_path`, params, db);
  await removeObjects(rows);
  return rows.length;
}

const INLINE = /^(image\/(png|jpe?g|webp)|application\/pdf|audio\/(mpeg|mp4|aac|wav)|video\/(mp4|webm|quicktime))$/;

/**
 * The response for a file the caller has already decided may be seen: a
 * short-lived link into the bucket, or the bytes for files from before the move.
 */
export async function fileResponse(
  file: { name: string; mime: string; size: number; storage_path: string | null; data?: Buffer | null },
  options: { cache?: "private" | "public"; onlyImages?: boolean; download?: boolean } = {},
): Promise<Response> {
  // download: always save it (feedback Sabine 17: a moodboard picture can be opened and downloaded).
  const inline = INLINE.test(file.mime) && !options.download;
  if (options.onlyImages && !/^image\/(png|jpe?g|webp)$/.test(file.mime)) return new Response("Niet gevonden", { status: 404 });
  const cache = `${options.cache ?? "private"}, max-age=300`;

  if (file.storage_path) {
    const { data, error } = await storage().createSignedUrl(file.storage_path, 600, inline ? undefined : { download: file.name });
    if (error || !data) return new Response("Bestand niet gevonden", { status: 404 });
    return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": cache } });
  }
  if (!file.data) return new Response("Bestand niet gevonden", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline || options.download ? file.mime : "application/octet-stream",
      "Content-Length": String(file.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

/** Columns fileResponse needs. */
export const FILE_COLUMNS = "f.name, f.mime, f.size, f.storage_path, f.data";
