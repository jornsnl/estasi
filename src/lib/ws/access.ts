import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import type { User } from "@/lib/data";
import { isUuid, one } from "./db";
import type { Couple } from "./types";

export interface CoupleContext {
  account: User;
  couple: Couple;
  /** The owner (Sabine) may edit everything; the couple only their own parts. */
  isAdmin: boolean;
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
  return { account, couple, isAdmin };
}

/** For actions only Sabine may take inside a couple's portal. */
export async function requireCoupleAdmin(coupleId: unknown): Promise<CoupleContext> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.isAdmin) notFound();
  return ctx;
}
