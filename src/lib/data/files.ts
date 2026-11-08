import "server-only";
import { randomUUID } from "crypto";
import { one, pool } from "@/lib/db";
import { BUCKET, supabaseEnabled } from "@/lib/supabase/config";
import { adminClient } from "@/lib/supabase/server";
import type { FileStorage, StoredFileMeta } from "./store";
import type { FileRef } from "./types";
import { fromRow, isUuid, toParams, toRow } from "./rows";

/**
 * Academy uploads. The metadata is always a row in public.files. The bytes:
 * - with Supabase (production): in the private Storage bucket "academy",
 *   object name = file id, exactly as before;
 * - without Supabase (local development): in the column public.files.data.
 * Reading looks at the row itself: bytes in the row win, otherwise the bucket.
 * So files from either place keep working, whatever is configured now.
 */
export class AcademyFileStorage implements FileStorage {
  async save(
    data: Buffer,
    meta: { name: string; mime: string; belongsTo: string | null; uploadedBy: string },
  ): Promise<FileRef> {
    const file: StoredFileMeta = {
      id: randomUUID(),
      name: meta.name,
      mime: meta.mime || "application/octet-stream",
      size: data.length,
      belongsTo: meta.belongsTo,
      uploadedBy: meta.uploadedBy,
      createdAt: new Date().toISOString(),
    };
    const row = toRow("files", file);
    const inBucket = supabaseEnabled();
    const columns = [...Object.keys(row), "data"];
    const params = [...toParams("files", row), inBucket ? null : data];
    const insert = `insert into public.files (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`;

    if (inBucket) {
      const storage = adminClient().storage.from(BUCKET);
      const { error } = await storage.upload(file.id, data, { contentType: file.mime, upsert: false });
      if (error) throw new Error(`Supabase Storage: ${error.message}`);
      try {
        await pool().query(insert, params);
      } catch (err) {
        await storage.remove([file.id]);
        throw err;
      }
    } else {
      await pool().query(insert, params);
    }
    return { id: file.id, name: file.name, mime: file.mime, size: file.size };
  }

  async read(id: string) {
    if (!isUuid(id)) return null;
    const row = await one<Record<string, unknown> & { data: Buffer | null }>("select * from public.files where id = $1", [id]);
    if (!row) return null;
    const meta = fromRow<StoredFileMeta>("files", row);
    if (row.data) return { data: Buffer.from(row.data), meta };
    if (!supabaseEnabled()) return null;
    const { data, error } = await adminClient().storage.from(BUCKET).download(id);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), meta };
  }
}
