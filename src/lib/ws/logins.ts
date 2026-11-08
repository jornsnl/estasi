import "server-only";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getStore, type User } from "@/lib/data";
import { createDevAccount, deleteDevAccount, newDevSetupLink } from "@/lib/auth/dev-auth";
import { supabaseEnabled } from "@/lib/supabase/config";
import { isActivated } from "@/lib/domain/account";
import { CONFIRM_PATH } from "@/lib/auth/supabase-auth";
import { adminClient } from "@/lib/supabase/server";
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
  const supabase = supabaseEnabled();
  let id: string;
  if (supabase) {
    const { data, error } = await adminClient().auth.admin.createUser({ email, email_confirm: false, user_metadata: { name } });
    if (error || !data.user) throw new LoginError(`Account aanmaken mislukt: ${error?.message ?? "onbekende fout"}`);
    id = data.user.id;
  } else {
    id = await createDevAccount(email, name);
  }
  const now = new Date().toISOString();
  try {
    return await store.createUser({
      id,
      email,
      name,
      role: "couple",
      activatedAt: null,
      createdAt: now,
      lastActiveAt: null,
    });
  } catch (err) {
    await (supabase ? adminClient().auth.admin.deleteUser(id) : deleteDevAccount(id)).catch(() => undefined);
    throw err;
  }
}

/** A one-time link to choose a password (invite) or a new one (reset). */
export async function loginLink(user: User): Promise<string> {
  if (supabaseEnabled()) {
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
  // Development login: its own activation link.
  return newDevSetupLink(user.id, LOCAL_LINK_DAYS);
}
