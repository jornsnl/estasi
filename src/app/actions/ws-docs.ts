"use server";

import { requireCoupleAdmin } from "@/lib/ws/access";
import { isUuid, one, query } from "@/lib/ws/db";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { done, str } from "@/lib/ws/redirect";

/**
 * Documents on "Jullie pakket" and "Facturen & Offertes". Only Sabine
 * uploads, replaces and deletes; the couple opens and downloads.
 */

const SECTIONS = { package: "/pakket#documenten", invoices: "/facturen" } as const;
type Section = keyof typeof SECTIONS;

function sectionOf(formData: FormData): Section {
  return str(formData, "section") === "invoices" ? "invoices" : "package";
}

export async function addDocument(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const section = sectionOf(formData);
  const back = `/k/${ctx.couple.id}${SECTIONS[section]}`;
  // Fixed documents (for all couples) only exist on "Jullie pakket".
  const forAll = section === "package" && str(formData, "scope") === "all";
  try {
    const file = await storeUpload(formData.get("file"), { coupleId: ctx.couple.id, accountId: ctx.account.id });
    if (!file) done(back, "Kies eerst een bestand.", true);
    if (forAll) await query("update files set couple_id = null where id = $1", [file.id]);
    const title = str(formData, "title", 200) || file.name.replace(/\.[^.]+$/, "");
    await query(
      `insert into documents (couple_id, section, title, file_id, position)
       values ($1, $2, $3, $4, (select coalesce(max(position), 0) + 1 from documents where couple_id is not distinct from $1 and section = $2))`,
      [forAll ? null : ctx.couple.id, section, title, file.id],
    );
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  done(back, forAll ? "Document toegevoegd voor alle bruidsparen." : "Document toegevoegd.");
}

/** A new version: the same document, a new file. For a fixed document every couple sees it at once. */
export async function replaceDocument(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const section = sectionOf(formData);
  const back = `/k/${ctx.couple.id}${SECTIONS[section]}`;
  const id = str(formData, "documentId", 40);
  const doc = isUuid(id)
    ? await one<{ id: string; couple_id: string | null; file_id: string }>(
        "select id, couple_id, file_id from documents where id = $1 and (couple_id = $2 or couple_id is null)",
        [id, ctx.couple.id],
      )
    : null;
  if (!doc) done(back, "Document niet gevonden.", true);
  try {
    const file = await storeUpload(formData.get("file"), { coupleId: ctx.couple.id, accountId: ctx.account.id });
    if (!file) done(back, "Kies eerst het nieuwe bestand.", true);
    if (doc.couple_id === null) await query("update files set couple_id = null where id = $1", [file.id]);
    await query("update documents set file_id = $2, updated_at = now() where id = $1", [doc.id, file.id]);
    await deleteFiles("delete from files where id = $1", [doc.file_id]);
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  done(back, doc.couple_id === null ? "Nieuwe versie staat nu bij alle bruidsparen." : "Nieuwe versie opgeslagen.");
}

export async function deleteDocument(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const section = sectionOf(formData);
  const back = `/k/${ctx.couple.id}${SECTIONS[section]}`;
  const id = str(formData, "documentId", 40);
  if (isUuid(id)) {
    const doc = await one<{ file_id: string }>(
      "delete from documents where id = $1 and (couple_id = $2 or couple_id is null) returning file_id",
      [id, ctx.couple.id],
    );
    if (doc) await deleteFiles("delete from files where id = $1", [doc.file_id]);
  }
  done(back, "Document verwijderd.");
}
