"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { reorder } from "@/lib/ws/package-order";
import { done, str } from "@/lib/ws/redirect";

/** Packages (feedback 10): the order everywhere, and deleting a package nobody has. */

export type MoveResult = { ok: true } | { ok: false; error: string };

/**
 * Moves a package one place or to an index, saved right away. With kind "od"
 * the index is within the opening dance packages (the dance page), otherwise
 * within all packages; the others keep their place.
 */
export async function movePackage(id: string, to: "up" | "down" | number, kind?: "od"): Promise<MoveResult> {
  await requireOwner();
  if (!isUuid(id) || !(to === "up" || to === "down" || Number.isInteger(to))) return { ok: false, error: "Ongeldige verplaatsing." };
  const moved = await tx(async (db) => {
    const rows = await query<{ id: string; position: number }>(
      `select id, position from packages where ($1::text is null or kind = $1) order by archived, position, name, id for update`,
      [kind ?? null],
      db,
    );
    const changes = reorder(rows, id, to);
    if (!changes) return false;
    for (const c of changes) await query("update packages set position = $2 where id = $1", [c.id, c.position], db);
    return true;
  });
  if (!moved) return { ok: false, error: "Dit pakket kan niet verder die kant op." };
  revalidatePath("/beheer/bruidsparen/pakketten");
  revalidatePath("/beheer/bruidsparen/openingsdans");
  return { ok: true };
}

/** The order of the opening dance packages on the dance page (and so everywhere). */
export async function moveDancePackage(id: string, to: number): Promise<MoveResult> {
  return movePackage(id, to, "od");
}

export async function moveAnyPackage(id: string, to: number): Promise<MoveResult> {
  return movePackage(id, to);
}

/** Deleting is only for packages no couple has (now or in their costs); otherwise hide it. */
export async function deletePackage(formData: FormData) {
  await requireOwner();
  const id = str(formData, "packageId", 40);
  const back = str(formData, "back", 200).startsWith("/beheer/") ? str(formData, "back", 200) : "/beheer/bruidsparen/pakketten";
  if (!isUuid(id)) done(back, "Pakket niet gevonden.", true);
  const used = await one<{ n: number }>(
    `select ((select count(*) from couple_packages where package_id = $1) + (select count(*) from couples where package_id = $1))::int as n`,
    [id],
  );
  if ((used?.n ?? 0) > 0) done(back, "Dit pakket is gekoppeld aan een bruidspaar en kan niet worden verwijderd. Verberg het in plaats daarvan.", true);
  const row = await one<{ name: string }>("delete from packages where id = $1 returning name", [id]);
  done(back, row ? `"${row.name}" is verwijderd.` : "Pakket niet gevonden.", !row);
}
