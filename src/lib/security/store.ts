import "server-only";
import { isSupabaseMode } from "@/lib/data";
import type { McpSettings, OAuthClient, OAuthCode, OAuthGrant, Passkey } from "./types";
import { LocalSecurityStore } from "./local-store";
import { SupabaseSecurityStore } from "./supabase-store";

export type * from "./types";

/** Persistence for passkeys and the MCP connection. Same idea as DataStore. */
export interface SecurityStore {
  listPasskeys(userId: string): Promise<Passkey[]>;
  getPasskey(id: string): Promise<Passkey | null>;
  savePasskey(passkey: Passkey): Promise<void>;
  deletePasskey(id: string, userId: string): Promise<void>;

  getMcpSettings(userId: string): Promise<McpSettings | null>;
  saveMcpSettings(settings: McpSettings): Promise<void>;
  /** Owners with MCP switched on (dynamic registration checks this). */
  listMcpSettings(): Promise<McpSettings[]>;

  listClients(): Promise<OAuthClient[]>;
  getClient(id: string): Promise<OAuthClient | null>;
  saveClient(client: OAuthClient): Promise<void>;
  /** Also removes the grants and codes of the client. */
  deleteClient(id: string): Promise<void>;

  saveCode(code: OAuthCode): Promise<void>;
  /** Returns the code and deletes it in one go, so a code works only once. */
  takeCode(codeHash: string): Promise<OAuthCode | null>;

  listGrants(userId: string): Promise<OAuthGrant[]>;
  getGrant(id: string): Promise<OAuthGrant | null>;
  grantByAccessHash(hash: string): Promise<OAuthGrant | null>;
  grantByRefreshHash(hash: string): Promise<OAuthGrant | null>;
  saveGrant(grant: OAuthGrant): Promise<void>;
  /** Changes only the given fields (last used, revoked). */
  updateGrant(id: string, patch: Partial<OAuthGrant>): Promise<void>;
  /** Swaps the refresh token only when it is still the current one (no double use). */
  rotateGrant(id: string, expectedRefreshHash: string, patch: Partial<OAuthGrant>): Promise<boolean>;
}

let store: SecurityStore | undefined;

export function getSecurityStore(): SecurityStore {
  store ??= isSupabaseMode() ? new SupabaseSecurityStore() : new LocalSecurityStore();
  return store;
}
