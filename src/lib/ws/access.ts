import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { requireUser } from "@/lib/auth/session";
import type { User } from "@/lib/data";
import { isUuid, one, query } from "./db";
import type { Couple } from "./types";
import { sectionsFor, type PackageKind } from "./pure";

export { sectionsFor, type PackageKind };

export interface CoupleContext {
  account: User;
  couple: Couple;
  /** The owner (Sabine) may edit everything; the couple only their own parts. */
  isAdmin: boolean;
  /** Kinds of the couple's packages: wp Weddingplanner, cm Ceremoniemeester, od Openingsdans. */
  kinds: PackageKind[];
  /** Run sheet, styling, guests, suppliers...: with WP or CM (or no package yet). Sabine always. */
  planning: boolean;
  /** The opening dance page: with OD. Sabine always. */
  dance: boolean;
}

export async function packageKinds(coupleId: string): Promise<PackageKind[]> {
  const rows = await query<{ kind: PackageKind }>(
    "select distinct p.kind from couple_packages cp join packages p on p.id = cp.package_id where cp.couple_id = $1",
    [coupleId],
  );
  return rows.map((r) => r.kind);
}

/** The couple a "couple" account belongs to, or null. */
export async function coupleIdOf(userId: string): Promise<string | null> {
  const row = await one<{ couple_id: string }>(
    "select m.couple_id from members m join couples c on c.id = m.couple_id where m.user_id = $1 and c.status = 'active'",
    [userId],
  );
  return row?.couple_id ?? null;
}

/**
 * The one gate in front of every couple page and action. A couple account
 * only ever gets its own (shared) couple; anything else is "not found", so
 * another couple's id does not even reveal that it exists.
 */
export async function requireCouple(coupleId: unknown): Promise<CoupleContext> {
  return loadCouple(typeof coupleId === "string" ? coupleId : "");
}

/** Once per request (layout and page both ask): the queries below are not run twice on every page change. */
const loadCouple = cache(async (coupleId: string): Promise<CoupleContext> => {
  const account = await requireUser();
  const isAdmin = account.role === "owner";
  if (!isAdmin) {
    if (account.role !== "couple") redirect("/dashboard");
    const own = await coupleIdOf(account.id);
    if (!own) redirect("/k");
    if (own !== coupleId) redirect(`/k/${own}`);
  }
  if (!isUuid(coupleId)) notFound();
  const couple = await one<Couple>("select * from couples where id = $1", [coupleId]);
  if (!couple) notFound();
  const kinds = await packageKinds(couple.id);
  const { planning, dance } = sectionsFor(kinds, isAdmin);
  return { account, couple, isAdmin, kinds, planning, dance };
});

/** Pages of the planning part (run sheet, guests, styling...): not with only the opening dance. */
export async function requirePlanning(coupleId: unknown): Promise<CoupleContext> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning) notFound();
  return ctx;
}

/** The opening dance page. */
export async function requireDance(coupleId: unknown): Promise<CoupleContext> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.dance) notFound();
  return ctx;
}

/** For actions only Sabine may take inside a couple's portal. */
export async function requireCoupleAdmin(coupleId: unknown): Promise<CoupleContext> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.isAdmin) notFound();
  return ctx;
}
