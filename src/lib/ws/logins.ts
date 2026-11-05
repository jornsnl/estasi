import "server-only";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getStore, isSupabaseMode, type User } from "@/lib/data";
import { isActivated } from "@/lib/domain/account";
import { newToken } from "@/lib/auth/password";
import { CONFIRM_PATH } from "@/lib/auth/supabase-auth";
import { adminClient } from "@/lib/supabase/server";
import { newId } from "@/lib/util/id";
import { appUrl } from "./mail";

/**
 * Couples sign in with the Academy's own accounts (role "couple"), so Sabine
 * has one login and one admin. With Supabase the account lives in Supabase
 * Auth; the link is made here (not mailed by Supabase), so the invitation can
 * use Wedding Space wording and our own mail.
 */

const LOCAL_LINK_DAYS = 14;

export class LoginError extends Error {}

/** Creates or finds the couple account for an e-mail address. */
export async function ensureCoupleUser(email: string, name: string): Promise<User> {
  const store = getStore();
  const existing = await store.getUserByEmail(email);
  if (existing) {
    if (existing.role !== "couple") throw new LoginError(`${email} heeft al een account in de Academy. Gebruik een ander e-mailadres.`);
    return existing;
  }
  let id: string = newId();
  if (isSupabaseMode()) {
    const { data, error } = await adminClient().auth.admin.createUser({ email, email_confirm: false, user_metadata: { name } });
    if (error || !data.user) throw new LoginError(`Account aanmaken mislukt: ${error?.message ?? "onbekende fout"}`);
    id = data.user.id;
  }
  const now = new Date().toISOString();
  try {
    return await store.createUser({
      id,
      email,
      name,
      role: "couple",
      passwordHash: null,
      setupToken: null,
      setupTokenExpiresAt: null,
      activatedAt: null,
      createdAt: now,
      lastActiveAt: null,
    });
  } catch (err) {
    if (isSupabaseMode()) await adminClient().auth.admin.deleteUser(id).catch(() => undefined);
    throw err;
  }
}

/** A one-time link to choose a password (invite) or a new one (reset). */
export async function loginLink(user: User): Promise<string> {
  if (isSupabaseMode()) {
    const type: "invite" | "recovery" = isActivated(user) ? "recovery" : "invite";
    // An invited user who already opened a link is confirmed; then only "recovery" works.
    let result = await adminClient().auth.admin.generateLink({ type, email: user.email, options: { redirectTo: `${appUrl()}${CONFIRM_PATH}` } } as never);
    let used: EmailOtpType = type;
    if (result.error && type === "invite") {
      result = await adminClient().auth.admin.generateLink({ type: "recovery", email: user.email, options: { redirectTo: `${appUrl()}${CONFIRM_PATH}` } });
      used = "recovery";
    }
    const hashed = (result.data as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
    if (result.error || !hashed) throw new LoginError(`Link maken mislukt: ${result.error?.message ?? "onbekende fout"}`);
    return `${appUrl()}${CONFIRM_PATH}?token_hash=${encodeURIComponent(hashed)}&type=${used}`;
  }
  // Local mode: the Academy's own activation link.
  const token = newToken();
  await getStore().updateUser(user.id, {
    setupToken: token,
    setupTokenExpiresAt: new Date(Date.now() + LOCAL_LINK_DAYS * 86_400_000).toISOString(),
  });
  return `${appUrl()}/activeren/${token}`;
}
