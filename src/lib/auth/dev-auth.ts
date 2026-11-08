import "server-only";
import { one, query } from "@/lib/db";
import { getStore, type User } from "@/lib/data";
import { appUrl } from "@/lib/supabase/config";
import { assertDevAuth } from "./dev-mode";
import { hashPassword, newToken, verifyPassword } from "./password";

/**
 * Accounts without Supabase Auth, for local development and tests only.
 * Every function starts with assertDevAuth(): with SUPABASE_URL set or with
 * NODE_ENV=production it throws before touching anything.
 *
 * - The account row goes into auth.users (the local stub), because
 *   public.users.id references it, just like with Supabase.
 * - Passwords and one-time links live in public.dev_passwords (migration 0023).
 * - The session is the signed cookie in src/lib/auth/session.ts.
 */

export { devAuthAllowed } from "./dev-mode";

/** Creates the auth.users row and returns its id (Supabase does this on invite). */
export async function createDevAccount(email: string, name: string): Promise<string> {
  assertDevAuth();
  const row = await one<{ id: string }>(
    "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, $2) returning id",
    [email, JSON.stringify({ name })],
  );
  return row!.id;
}

/** Rolls back an account when saving the rest failed halfway (public.users cascades). */
export async function deleteDevAccount(userId: string) {
  assertDevAuth();
  await query("delete from auth.users where id = $1", [userId]);
}

/** Returns the user id, or null when the e-mail or password is wrong. */
export async function devSignIn(email: string, password: string): Promise<string | null> {
  assertDevAuth();
  const row = await one<{ id: string; password_hash: string | null }>(
    `select u.id, d.password_hash from public.users u left join public.dev_passwords d on d.user_id = u.id where u.email = $1`,
    [email.trim().toLowerCase()],
  );
  // verifyPassword also runs (against a dummy hash) for unknown addresses.
  return verifyPassword(password, row?.password_hash ?? null) ? row!.id : null;
}

/** Sets the password, uses up any open link and marks the account as activated. */
export async function setDevPassword(userId: string, password: string) {
  assertDevAuth();
  await query(
    `insert into public.dev_passwords (user_id, password_hash, setup_token, setup_token_expires_at, updated_at)
     values ($1, $2, null, null, now())
     on conflict (user_id) do update set password_hash = excluded.password_hash, setup_token = null,
       setup_token_expires_at = null, updated_at = now()`,
    [userId, hashPassword(password)],
  );
  await query("update public.users set activated_at = coalesce(activated_at, now()) where id = $1", [userId]);
}

/** A one-time link to choose a (new) password; replaces an older link. */
export async function newDevSetupLink(userId: string, days: number): Promise<string> {
  assertDevAuth();
  const token = newToken();
  await query(
    `insert into public.dev_passwords (user_id, setup_token, setup_token_expires_at, updated_at)
     values ($1, $2, now() + make_interval(days => $3), now())
     on conflict (user_id) do update set setup_token = excluded.setup_token,
       setup_token_expires_at = excluded.setup_token_expires_at, updated_at = now()`,
    [userId, token, days],
  );
  return `${appUrl()}/activeren/${token}`;
}

/** The open link of an account, for the admin page (there is no mail in development). */
export async function devPendingLink(userId: string): Promise<{ link: string; expiresAt: string } | null> {
  assertDevAuth();
  const row = await one<{ setup_token: string; setup_token_expires_at: Date }>(
    "select setup_token, setup_token_expires_at from public.dev_passwords where user_id = $1 and setup_token is not null",
    [userId],
  );
  return row ? { link: `${appUrl()}/activeren/${row.setup_token}`, expiresAt: row.setup_token_expires_at.toISOString() } : null;
}

/** The account behind a link that is still valid. */
export async function devLinkAccount(token: string): Promise<{ user: User; hasPassword: boolean } | null> {
  assertDevAuth();
  if (!token || token.length > 100) return null;
  const row = await one<{ user_id: string; has_password: boolean }>(
    `select user_id, password_hash is not null as has_password from public.dev_passwords
      where setup_token = $1 and setup_token_expires_at > now()`,
    [token],
  );
  const user = row ? await getStore().getUser(row.user_id) : null;
  return user ? { user, hasPassword: row!.has_password } : null;
}
