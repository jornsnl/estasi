import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromRow, isUuid, toRow, type Table } from "@/lib/data/supabase-rows";
import { adminClient } from "@/lib/supabase/server";
import type { SecurityStore } from "./store";
import type { McpSettings, OAuthClient, OAuthCode, OAuthGrant, Passkey } from "./types";

/**
 * Supabase tables from migration 0016, reached with the secret key only.
 * Tokens and secrets are stored as sha256 hashes, never as they are.
 */

type Result = { data: unknown; error: { message: string } | null };

function check<T>(result: Result, what: string): T {
  if (result.error) throw new Error(`Supabase (${what}): ${result.error.message}`);
  return result.data as T;
}

export class SupabaseSecurityStore implements SecurityStore {
  constructor(private readonly client: () => SupabaseClient = adminClient) {}

  private from(table: Table) {
    return this.client().from(table);
  }

  private many<T>(table: Table, rows: unknown): T[] {
    return ((rows as Record<string, unknown>[] | null) ?? []).map((r) => fromRow<T>(table, r));
  }

  private single<T>(table: Table, row: unknown): T | null {
    return row ? fromRow<T>(table, row as Record<string, unknown>) : null;
  }

  async listPasskeys(userId: string) {
    if (!isUuid(userId)) return [];
    return this.many<Passkey>("passkeys", check(await this.from("passkeys").select().eq("user_id", userId).order("created_at"), "passkeys"));
  }
  async getPasskey(id: string) {
    return this.single<Passkey>("passkeys", check(await this.from("passkeys").select().eq("id", id).maybeSingle(), "passkeys"));
  }
  async savePasskey(passkey: Passkey) {
    check(await this.from("passkeys").upsert(toRow("passkeys", passkey)), "passkeys");
  }
  async deletePasskey(id: string, userId: string) {
    check(await this.from("passkeys").delete().eq("id", id).eq("user_id", userId), "passkeys");
  }

  async getMcpSettings(userId: string) {
    if (!isUuid(userId)) return null;
    return this.single<McpSettings>("mcp_settings", check(await this.from("mcp_settings").select().eq("user_id", userId).maybeSingle(), "mcp_settings"));
  }
  async saveMcpSettings(settings: McpSettings) {
    check(await this.from("mcp_settings").upsert(toRow("mcp_settings", settings), { onConflict: "user_id" }), "mcp_settings");
  }
  async listMcpSettings() {
    return this.many<McpSettings>("mcp_settings", check(await this.from("mcp_settings").select(), "mcp_settings"));
  }

  async listClients() {
    return this.many<OAuthClient>("oauth_clients", check(await this.from("oauth_clients").select().order("created_at"), "oauth_clients"));
  }
  async getClient(id: string) {
    if (!id || id.length > 100) return null;
    return this.single<OAuthClient>("oauth_clients", check(await this.from("oauth_clients").select().eq("id", id).maybeSingle(), "oauth_clients"));
  }
  async saveClient(client: OAuthClient) {
    check(await this.from("oauth_clients").upsert(toRow("oauth_clients", client)), "oauth_clients");
  }
  async deleteClient(id: string) {
    // Grants and codes go with it (on delete cascade).
    check(await this.from("oauth_clients").delete().eq("id", id), "oauth_clients");
  }

  async saveCode(code: OAuthCode) {
    check(await this.from("oauth_codes").delete().lt("expires_at", new Date().toISOString()), "oauth_codes");
    check(await this.from("oauth_codes").insert(toRow("oauth_codes", code)), "oauth_codes");
  }
  async takeCode(codeHash: string) {
    // delete ... returning: two requests with the same code cannot both get it.
    const rows = check<unknown[]>(await this.from("oauth_codes").delete().eq("code_hash", codeHash).select(), "oauth_codes");
    return this.single<OAuthCode>("oauth_codes", rows?.[0]);
  }

  async listGrants(userId: string) {
    if (!isUuid(userId)) return [];
    return this.many<OAuthGrant>("oauth_grants", check(await this.from("oauth_grants").select().eq("user_id", userId).order("created_at"), "oauth_grants"));
  }
  async getGrant(id: string) {
    if (!isUuid(id)) return null;
    return this.single<OAuthGrant>("oauth_grants", check(await this.from("oauth_grants").select().eq("id", id).maybeSingle(), "oauth_grants"));
  }
  async grantByAccessHash(hash: string) {
    return this.single<OAuthGrant>("oauth_grants", check(await this.from("oauth_grants").select().eq("access_hash", hash).maybeSingle(), "oauth_grants"));
  }
  async grantByRefreshHash(hash: string) {
    return this.single<OAuthGrant>("oauth_grants", check(await this.from("oauth_grants").select().eq("refresh_hash", hash).maybeSingle(), "oauth_grants"));
  }
  async saveGrant(grant: OAuthGrant) {
    check(await this.from("oauth_grants").upsert(toRow("oauth_grants", grant)), "oauth_grants");
  }
  async updateGrant(id: string, patch: Partial<OAuthGrant>) {
    if (!isUuid(id)) return;
    check(await this.from("oauth_grants").update(toRow("oauth_grants", patch, true)).eq("id", id), "oauth_grants");
  }
  async rotateGrant(id: string, expectedRefreshHash: string, patch: Partial<OAuthGrant>) {
    const rows = check<unknown[]>(
      await this.from("oauth_grants").update(toRow("oauth_grants", patch, true)).eq("id", id).eq("refresh_hash", expectedRefreshHash).select("id"),
      "oauth_grants",
    );
    return (rows ?? []).length === 1;
  }
}
