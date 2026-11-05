import "server-only";
import { notFound, redirect } from "next/navigation";
import { isUuid, one } from "@/lib/db";
import type { Account, Couple } from "@/lib/types";
import { requireAccount } from "./session";

export interface CoupleContext {
  account: Account;
  couple: Couple;
  /** Sabine (admin) may edit everything; the couple only their own parts. */
  isAdmin: boolean;
}

/**
 * The one gate in front of every couple page and action. A couple account
 * only ever gets its own couple; anything else is "not found", so another
 * couple's id does not even reveal that it exists.
 */
export async function requireCouple(coupleId: unknown): Promise<CoupleContext> {
  const account = await requireAccount();
  const isAdmin = account.role === "admin";
  if (!isUuid(coupleId) || (!isAdmin && account.couple_id !== coupleId)) {
    if (!isAdmin && account.couple_id) redirect(`/k/${account.couple_id}`);
    notFound();
  }
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
