import "server-only";
import { fromRow, isUuid } from "@/lib/data/rows";
import { Sql } from "@/lib/data/pg-store";
import type { SecurityStore } from "./store";
import type { McpSettings, OAuthClient, OAuthCode, OAuthGrant, Passkey } from "./types";

/**
 * Tables from migration 0016 in Postgres (shared pool, schema public).
 * Tokens and secrets are stored as sha256 hashes, never as they are.
 */
export class PgSecurityStore implements SecurityStore {
  constructor(private readonly sql = new Sql()) {}

  async listPasskeys(userId: string) {
    if (!isUuid(userId)) return [];
    return this.sql.many<Passkey>("passkeys", "user_id = $1", [userId], "created_at");
  }
  async getPasskey(id: string) {
    return this.sql.first<Passkey>("passkeys", "id = $1", [id]);
  }
  async savePasskey(passkey: Passkey) {
    await this.sql.upsert("passkeys", passkey, ["id"]);
  }
  async deletePasskey(id: string, userId: string) {
    if (!isUuid(userId)) return;
    await this.sql.exec("delete from public.passkeys where id = $1 and user_id = $2", [id, userId]);
  }

  async getMcpSettings(userId: string) {
    if (!isUuid(userId)) return null;
    return this.sql.first<McpSettings>("mcp_settings", "user_id = $1", [userId]);
  }
  async saveMcpSettings(settings: McpSettings) {
    await this.sql.upsert("mcp_settings", settings, ["user_id"]);
  }
  async listMcpSettings() {
    return this.sql.many<McpSettings>("mcp_settings");
  }

  async listClients() {
    return this.sql.many<OAuthClient>("oauth_clients", "", [], "created_at");
  }
  async getClient(id: string) {
    if (!id || id.length > 100) return null;
    return this.sql.first<OAuthClient>("oauth_clients", "id = $1", [id]);
  }
  async saveClient(client: OAuthClient) {
    await this.sql.upsert("oauth_clients", client, ["id"]);
  }
  async deleteClient(id: string) {
    // Grants and codes go with it (on delete cascade).
    await this.sql.exec("delete from public.oauth_clients where id = $1", [id]);
  }

  async saveCode(code: OAuthCode) {
    await this.sql.exec("delete from public.oauth_codes where expires_at < now()");
    await this.sql.insert("oauth_codes", code);
  }
  async takeCode(codeHash: string) {
    // delete ... returning: two requests with the same code cannot both get it.
    const { rows } = await this.sql.exec("delete from public.oauth_codes where code_hash = $1 returning *", [codeHash]);
    return rows[0] ? fromRow<OAuthCode>("oauth_codes", rows[0]) : null;
  }

  async listGrants(userId: string) {
    if (!isUuid(userId)) return [];
    return this.sql.many<OAuthGrant>("oauth_grants", "user_id = $1", [userId], "created_at");
  }
  async getGrant(id: string) {
    if (!isUuid(id)) return null;
    return this.sql.first<OAuthGrant>("oauth_grants", "id = $1", [id]);
  }
  async grantByAccessHash(hash: string) {
    return this.sql.first<OAuthGrant>("oauth_grants", "access_hash = $1", [hash]);
  }
  async grantByRefreshHash(hash: string) {
    return this.sql.first<OAuthGrant>("oauth_grants", "refresh_hash = $1", [hash]);
  }
  async saveGrant(grant: OAuthGrant) {
    await this.sql.upsert("oauth_grants", grant, ["id"]);
  }
  async updateGrant(id: string, patch: Partial<OAuthGrant>) {
    if (!isUuid(id)) return;
    await this.sql.update("oauth_grants", patch, "id = $1", [id]);
  }
  async rotateGrant(id: string, expectedRefreshHash: string, patch: Partial<OAuthGrant>) {
    if (!isUuid(id)) return false;
    const updated = await this.sql.update("oauth_grants", patch, "id = $1 and refresh_hash = $2", [id, expectedRefreshHash]);
    return updated !== null;
  }
}
