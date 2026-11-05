import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import type { Account } from "@/lib/types";
import { hashToken, newToken } from "./tokens";

/**
 * Sessions live in the database: the cookie holds a random token, the table
 * only its hash. Logging out, a password change or Sabine revoking access
 * ends a session immediately, everywhere.
 */

const COOKIE = "ws_session";
const DAYS = 30;

export async function startSession(accountId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + DAYS * 86_400_000);
  await query("insert into sessions (token_hash, account_id, expires_at) values ($1, $2, $3)", [hashToken(token), accountId, expires]);
  await query("update accounts set last_login_at = now() where id = $1", [accountId]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await query("delete from sessions where token_hash = $1", [hashToken(token)]);
  store.delete(COOKIE);
}

/** Ends every session of an account, for example after a password reset. */
export async function endAllSessions(accountId: string) {
  await query("delete from sessions where account_id = $1", [accountId]);
}

export async function currentAccount(): Promise<Account | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const account = await one<Account & { last_seen_at: Date }>(
    `select a.id, a.email, a.name, a.role, a.couple_id, a.password_hash, a.last_login_at, s.last_seen_at
       from sessions s join accounts a on a.id = s.account_id
       left join couples c on c.id = a.couple_id
      where s.token_hash = $1 and s.expires_at > now()
        and (a.role = 'admin' or c.status = 'active')`,
    [hashToken(token)],
  );
  if (!account) return null;
  // Mark activity at most every 10 minutes.
  if (Date.now() - new Date(account.last_seen_at).getTime() > 10 * 60_000) {
    await query("update sessions set last_seen_at = now() where token_hash = $1", [hashToken(token)]);
  }
  return account;
}

export async function requireAccount(): Promise<Account> {
  const account = await currentAccount();
  if (!account) redirect("/login");
  return account;
}

export async function requireAdmin(): Promise<Account> {
  const account = await requireAccount();
  if (account.role !== "admin") redirect(homeFor(account));
  return account;
}

export const homeFor = (account: Pick<Account, "role" | "couple_id">) =>
  account.role === "admin" ? "/beheer" : `/k/${account.couple_id}`;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "onbekend";
}
