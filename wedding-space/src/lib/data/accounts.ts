import "server-only";
import type pg from "pg";
import { one, pool, query } from "@/lib/db";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { appUrl } from "@/lib/mail";

const INVITE_DAYS = 14;
const RESET_HOURS = 24;

/** Creates a one-time link and returns its URL. Older open links of the same kind stop working. */
export async function createAccountLink(
  accountId: string,
  purpose: "invite" | "reset",
  db: Pick<pg.Pool, "query"> = pool(),
): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + (purpose === "invite" ? INVITE_DAYS * 86_400_000 : RESET_HOURS * 3_600_000));
  await query("update account_tokens set used_at = now() where account_id = $1 and purpose = $2 and used_at is null", [accountId, purpose], db);
  await query("insert into account_tokens (token_hash, account_id, purpose, expires_at) values ($1, $2, $3, $4)", [hashToken(token), accountId, purpose, expires], db);
  return `${appUrl()}/activeren/${token}`;
}

export interface LinkInfo {
  accountId: string;
  name: string;
  purpose: "invite" | "reset";
  hasPassword: boolean;
}

/** Looks up a link without using it. */
export async function findAccountLink(token: string): Promise<LinkInfo | null> {
  if (!token || token.length > 100) return null;
  return one<LinkInfo>(
    `select t.account_id as "accountId", a.name, t.purpose, a.password_hash is not null as "hasPassword"
       from account_tokens t join accounts a on a.id = t.account_id
       left join couples c on c.id = a.couple_id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now()
        and (a.role = 'admin' or c.status = 'active')`,
    [hashToken(token)],
  );
}

/** Marks the link used; returns the account id only if it was still valid (one use, race safe). */
export async function useAccountLink(token: string, db: Pick<pg.Pool, "query"> = pool()): Promise<string | null> {
  const row = await one<{ account_id: string }>(
    `update account_tokens set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning account_id`,
    [hashToken(token)],
    db,
  );
  return row?.account_id ?? null;
}
