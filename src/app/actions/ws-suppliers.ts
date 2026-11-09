"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { requireCouple, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { done, str } from "@/lib/ws/redirect";
import { moveInList } from "@/lib/ws/recommendations";
import { syncAfterSave } from "@/lib/ws/runsheet";
import { cleanTime } from "@/lib/ws/runsheet-pure";
import { isSupplierStatus, recordFavorite } from "@/lib/ws/suppliers";
import type { Recommendation } from "@/lib/ws/types";

/** Suppliers of a couple. Sabine and the couple may both fill in and change everything. */

const list = (coupleId: string) => `/k/${coupleId}/leveranciers`;

async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}

const FIELDS = {
  name: 200,
  contact_person: 200,
  phone: 60,
  email: 200,
  website: 300,
  address: 300,
  notes: 5000,
} as const;
/** "Aanwezig op locatie vanaf / tot": rows in the day planning. */
const TIMES = ["present_from", "present_until"] as const;
export type SupplierField = keyof typeof FIELDS | "status" | (typeof TIMES)[number];

/** Saves one field of one row, straight from the table (no page reload). */
export async function saveSupplierField(
  coupleId: string,
  supplierId: string,
  field: SupplierField,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(supplierId)) return { ok: false, error: "Niet gevonden." };
  let clean: string;
  if (field === "status") {
    if (!isSupplierStatus(value)) return { ok: false, error: "Onbekende status." };
    clean = value;
  } else if ((TIMES as readonly string[]).includes(field)) {
    const time = cleanTime(value);
    if (time === null) return { ok: false, error: "Vul een tijd in als 13:30." };
    clean = time;
  } else if (field in FIELDS) {
    clean = String(value ?? "").trim().slice(0, FIELDS[field as keyof typeof FIELDS]);
  } else {
    return { ok: false, error: "Onbekend veld." };
  }
  // The column name comes from the fixed list above, never from the browser.
  const updated = await one(
    `update couple_suppliers set ${field} = $3, updated_at = now() where id = $1 and couple_id = $2 returning id`,
    [supplierId, ctx.couple.id, clean],
  );
  if (!updated) return { ok: false, error: "Niet gevonden." };
  if (field === "status") await note(ctx, "Status van een leverancier gewijzigd");
  // Name, status and times make the arrival and departure rows in the day planning.
  if (field === "name" || field === "status" || (TIMES as readonly string[]).includes(field)) await syncAfterSave(ctx.couple.id);
  return { ok: true };
}

/** Another supplier in the same category (e.g. two photographers to compare). */
export async function addSupplierRow(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const categoryId = str(formData, "categoryId", 40);
  const ok = isUuid(categoryId) && (await one(
    "select 1 from supplier_categories where id = $1 and not archived and (couple_id is null or couple_id = $2)",
    [categoryId, ctx.couple.id],
  ));
  if (!ok) done(list(ctx.couple.id), "Categorie niet gevonden.", true);
  await query(
    `insert into couple_suppliers (couple_id, category_id, position)
     values ($1, $2, (select coalesce(max(position), 0) + 1 from couple_suppliers where couple_id = $1 and category_id = $2))`,
    [ctx.couple.id, categoryId],
  );
  done(`${list(ctx.couple.id)}#c-${categoryId}`, "Regel toegevoegd.");
}

export async function deleteSupplierRow(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "supplierId", 40);
  if (isUuid(id)) {
    const files = await query<{ file_id: string }>(
      `select d.file_id from supplier_documents d join couple_suppliers s on s.id = d.supplier_id where s.id = $1 and s.couple_id = $2`,
      [id, ctx.couple.id],
    );
    await query("delete from couple_suppliers where id = $1 and couple_id = $2", [id, ctx.couple.id]);
    if (files.length) await deleteFiles("delete from files where id = any($1::uuid[])", [files.map((f) => f.file_id)]);
    await syncAfterSave(ctx.couple.id);
  }
  done(list(ctx.couple.id), "Leverancier verwijderd.");
}

/** A category of their own for this couple only (e.g. "Fotobooth"). */
export async function addCoupleCategory(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const name = str(formData, "name", 80);
  if (!name) done(list(ctx.couple.id), "Geef de categorie een naam.", true);
  const exists = await one(
    "select 1 from supplier_categories where not archived and lower(name) = lower($2) and (couple_id is null or couple_id = $1)",
    [ctx.couple.id, name],
  );
  if (exists) done(list(ctx.couple.id), `"${name}" staat al in de lijst.`, true);
  await query(
    "insert into supplier_categories (name, couple_id, position) values ($1, $2, (select coalesce(max(position), 0) + 1 from supplier_categories))",
    [name, ctx.couple.id],
  );
  await note(ctx, `Categorie "${name}" toegevoegd bij leveranciers`);
  done(list(ctx.couple.id), `Categorie "${name}" toegevoegd.`);
}

export async function deleteCoupleCategory(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "categoryId", 40);
  if (isUuid(id)) await query("delete from supplier_categories where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  await syncAfterSave(ctx.couple.id);
  done(list(ctx.couple.id), "Categorie verwijderd.");
}

/** The details page: documents (contact fields are saved from the table or here). */
export async function saveSupplierDetails(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "supplierId", 40);
  const back = `${list(ctx.couple.id)}/${id}`;
  const row = isUuid(id) ? await one<{ id: string }>("select id from couple_suppliers where id = $1 and couple_id = $2", [id, ctx.couple.id]) : null;
  if (!row) done(list(ctx.couple.id), "Niet gevonden.", true);
  const status = str(formData, "status");
  try {
    await tx(async (db) => {
      await query(
        `update couple_suppliers set status = $3, name = $4, contact_person = $5, phone = $6, email = $7, website = $8, address = $9, notes = $10,
                updated_at = now()
          where id = $1 and couple_id = $2`,
        [row.id, ctx.couple.id, isSupplierStatus(status) ? status : "tbd", str(formData, "name", 200), str(formData, "contactPerson", 200),
         str(formData, "phone", 60), str(formData, "email", 200), str(formData, "website", 300), str(formData, "address", 300), str(formData, "notes", 5000)],
        db,
      );
      const file = await storeUpload(formData.get("document"), { coupleId: ctx.couple.id, accountId: ctx.account.id }, db);
      if (file) await query("insert into supplier_documents (supplier_id, file_id) values ($1, $2)", [row.id, file.id], db);
    });
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  await note(ctx, "Leverancier bijgewerkt");
  await syncAfterSave(ctx.couple.id);
  done(back, "Opgeslagen.");
}

export async function deleteSupplierDocument(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "documentId", 40);
  const supplierId = str(formData, "supplierId", 40);
  if (isUuid(id)) {
    await deleteFiles(
      `delete from files where id = (select d.file_id from supplier_documents d join couple_suppliers s on s.id = d.supplier_id
                                      where d.id = $1 and s.couple_id = $2)`,
      [id, ctx.couple.id],
    );
  }
  done(`${list(ctx.couple.id)}/${supplierId}`, "Document verwijderd.");
}

// Favourites from the recommendations -------------------------------------------------------------

/**
 * The heart on a recommendation. On: the supplier goes onto "Jullie
 * leveranciers" as "Huidige favoriet" (in an empty row of that category, or
 * a new one). Off again: only while the status is still "Huidige favoriet".
 */
export async function toggleFavorite(coupleId: string, recommendationId: string): Promise<{ favorite: boolean; message?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(recommendationId)) return { favorite: false, message: "Niet gevonden." };
  const rec = await one<Recommendation>("select * from recommendations where id = $1 and not archived", [recommendationId]);
  if (!rec) return { favorite: false, message: "Niet gevonden." };

  const existing = await one<{ id: string; status: string }>(
    "select id, status from couple_suppliers where couple_id = $1 and recommendation_id = $2 order by created_at limit 1",
    [ctx.couple.id, rec.id],
  );
  if (existing) {
    if (existing.status !== "favorite") {
      return { favorite: true, message: "Deze leverancier heeft al een andere status. Pas die aan bij Jullie leveranciers." };
    }
    const others = await one<{ n: number }>(
      "select count(*)::int as n from couple_suppliers where couple_id = $1 and category_id = $2",
      [ctx.couple.id, rec.category_id],
    );
    if ((others?.n ?? 0) > 1) {
      await query("delete from couple_suppliers where id = $1", [existing.id]);
    } else {
      // The last row of the category stays, empty again.
      await query(
        `update couple_suppliers set status = 'tbd', recommendation_id = null, name = '', contact_person = '', phone = '', email = '', website = '', updated_at = now()
          where id = $1`,
        [existing.id],
      );
    }
    await note(ctx, `${rec.name} niet meer als favoriet`);
    revalidatePath(`/k/${ctx.couple.id}/leveranciers`, "layout");
    return { favorite: false };
  }

  const empty = await one<{ id: string }>(
    `select id from couple_suppliers
      where couple_id = $1 and category_id = $2 and recommendation_id is null and status = 'tbd'
        and name = '' and contact_person = '' and phone = '' and email = '' and website = '' and notes = ''
      order by position, created_at limit 1`,
    [ctx.couple.id, rec.category_id],
  );
  const values = [rec.name, rec.phone, rec.email, rec.website, rec.id, rec.contact_person];
  if (empty) {
    await query(
      `update couple_suppliers set status = 'favorite', name = $2, phone = $3, email = $4, website = $5, recommendation_id = $6,
              contact_person = $7, updated_at = now()
        where id = $1`,
      [empty.id, ...values],
    );
  } else {
    await query(
      `insert into couple_suppliers (couple_id, category_id, status, name, phone, email, website, recommendation_id, contact_person, position)
       values ($1, $2, 'favorite', $3, $4, $5, $6, $7, $8,
               (select coalesce(max(position), 0) + 1 from couple_suppliers where couple_id = $1 and category_id = $2))`,
      [ctx.couple.id, rec.category_id, ...values],
    );
  }
  if (!ctx.isAdmin) {
    await logActivity(ctx.couple.id, ctx.account.id, `${rec.name} gekozen als favoriet`);
    await recordFavorite(ctx.couple, rec.id);
  }
  // The table under Jullie leveranciers and the hearts show the new state on the next visit too.
  revalidatePath(`/k/${ctx.couple.id}/leveranciers`, "layout");
  return { favorite: true };
}

// Sabine's recommendations (managed centrally) ------------------------------------------------------

const RECS = "/beheer/bruidsparen/aanraders";

export async function saveRecommendation(formData: FormData) {
  const account = await requireOwner();
  const id = str(formData, "recommendationId", 40);
  const back = isUuid(id) ? `${RECS}#r-${id}` : RECS;
  const name = str(formData, "name", 200);
  const categoryId = str(formData, "categoryId", 40);
  const profession = str(formData, "profession", 120);
  if (!name) done(back, "Vul de bedrijfsnaam in.", true);
  if (!isUuid(categoryId) || !(await one("select 1 from supplier_categories where id = $1 and couple_id is null", [categoryId]))) {
    done(back, "Kies een categorie.", true);
  }
  if (!profession) done(back, "Vul het beroep in.", true);
  const current = isUuid(id) ? await one<Recommendation>("select * from recommendations where id = $1", [id]) : null;
  try {
    const photo = await storeUpload(formData.get("photo"), { coupleId: null, accountId: account.id, kind: "image" });
    const brochure = await storeUpload(formData.get("brochure"), { coupleId: null, accountId: account.id, kind: "pdf" });
    const photoId = photo?.id ?? (formData.get("removePhoto") === "on" ? null : current?.photo_file_id ?? null);
    const brochureId = brochure?.id ?? (formData.get("removeBrochure") === "on" ? null : current?.brochure_file_id ?? null);
    const values = [
      categoryId, name, profession, str(formData, "phone", 60), str(formData, "email", 200),
      str(formData, "website", 300), str(formData, "experience", 5000), photoId, brochureId,
      str(formData, "region", 120), str(formData, "contactPerson", 200), str(formData, "instagram", 300),
      str(formData, "description", 5000), str(formData, "workArea", 200), str(formData, "priceIndication", 200),
      str(formData, "availability", 200),
      // "Zichtbaar" unchecked = hidden (archived).
      formData.get("visible") !== "on",
    ];
    // A new category: at the end of that category.
    const lastInCategory = "(select coalesce(max(position), 0) + 1 from recommendations where category_id = $1)";
    if (current) {
      await query(
        `update recommendations set category_id = $1, name = $2, profession = $3, phone = $4, email = $5, website = $6, experience = $7,
                photo_file_id = $8, brochure_file_id = $9, region = $10, contact_person = $11, instagram = $12, description = $13,
                work_area = $14, price_indication = $15, availability = $16, archived = $17,
                position = case when category_id = $1 then position else ${lastInCategory} end, updated_at = now()
          where id = $18`,
        [...values, current.id],
      );
      const old = [
        current.photo_file_id !== photoId ? current.photo_file_id : null,
        current.brochure_file_id !== brochureId ? current.brochure_file_id : null,
      ].filter((f): f is string => Boolean(f));
      if (old.length) await deleteFiles("delete from files where id = any($1::uuid[]) and couple_id is null", [old]);
    } else {
      await query(
        `insert into recommendations (category_id, name, profession, phone, email, website, experience, photo_file_id, brochure_file_id,
                                      region, contact_person, instagram, description, work_area, price_indication, availability, archived, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, ${lastInCategory})`,
        values,
      );
    }
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  done(back, current ? "Aanrader opgeslagen." : "Aanrader toegevoegd.");
}

/** Hide or show a recommendation for the couples, straight from the list. */
export async function toggleRecommendationVisible(formData: FormData) {
  await requireOwner();
  const id = str(formData, "recommendationId", 40);
  const rec = isUuid(id)
    ? await one<Recommendation>("update recommendations set archived = not archived, updated_at = now() where id = $1 returning *", [id])
    : null;
  if (!rec) done(RECS, "Niet gevonden.", true);
  done(`${RECS}#r-${rec.id}`, rec.archived ? `"${rec.name}" is verborgen voor de bruidsparen.` : `"${rec.name}" is weer zichtbaar.`);
}

/** One place up or down within its category. */
export async function moveRecommendation(formData: FormData) {
  await requireOwner();
  const id = str(formData, "recommendationId", 40);
  const direction = str(formData, "direction") === "up" ? "up" : "down";
  const rec = isUuid(id) ? await one<Recommendation>("select * from recommendations where id = $1", [id]) : null;
  if (!rec) done(RECS, "Niet gevonden.", true);
  const siblings = await query<{ id: string }>(
    "select id from recommendations where category_id = $1 order by position, name, id",
    [rec.category_id],
  );
  const order = moveInList(siblings.map((s) => s.id), rec.id, direction);
  if (order) {
    await tx(async (db) => {
      for (const [n, rid] of order.entries()) {
        await query("update recommendations set position = $2 where id = $1", [rid, n + 1], db);
      }
    });
  }
  done(`${RECS}#c-${rec.category_id}`, "Volgorde aangepast.");
}

export async function deleteRecommendation(formData: FormData) {
  await requireOwner();
  const id = str(formData, "recommendationId", 40);
  if (isUuid(id)) {
    const rec = await one<Recommendation>("delete from recommendations where id = $1 returning *", [id]);
    const files = [rec?.photo_file_id, rec?.brochure_file_id].filter((f): f is string => Boolean(f));
    if (files.length) await deleteFiles("delete from files where id = any($1::uuid[]) and couple_id is null", [files]);
  }
  done(RECS, "Aanrader verwijderd. Bij bruidsparen die hem als favoriet hadden blijft de leverancier staan.");
}

/** Sabine marked the new favourites as seen on her dashboard. */
export async function markFavoritesSeen() {
  await requireOwner();
  await query("update favorite_events set seen_at = now() where seen_at is null");
  done("/beheer/bruidsparen", "Gezien.");
}
