import "server-only";
import { db, mutate, type LocalDb, type LocalSecurity } from "@/lib/data/local-store";
import type { SecurityStore } from "./store";
import type { McpSettings, OAuthClient, OAuthCode, OAuthGrant, Passkey } from "./types";

/** Local development: everything in .data/db.json next to the Academy data. */

const clone = <T>(value: T): T => structuredClone(value);

function sec(d: LocalDb): LocalSecurity {
  d.security ??= { passkeys: [], mcpSettings: [], oauthClients: [], oauthCodes: [], oauthGrants: [] };
  return d.security;
}

const read = async () => sec(await db());

function upsert<T>(list: T[], item: T, match: (x: T) => boolean) {
  const index = list.findIndex(match);
  if (index === -1) list.push(clone(item));
  else list[index] = clone(item);
}

export class LocalSecurityStore implements SecurityStore {
  async listPasskeys(userId: string) {
    return clone((await read()).passkeys.filter((p) => p.userId === userId));
  }
  async getPasskey(id: string) {
    return clone((await read()).passkeys.find((p) => p.id === id) ?? null);
  }
  async savePasskey(passkey: Passkey) {
    await mutate((d) => upsert(sec(d).passkeys, passkey, (p) => p.id === passkey.id));
  }
  async deletePasskey(id: string, userId: string) {
    await mutate((d) => {
      sec(d).passkeys = sec(d).passkeys.filter((p) => !(p.id === id && p.userId === userId));
    });
  }

  async getMcpSettings(userId: string) {
    return clone((await read()).mcpSettings.find((m) => m.userId === userId) ?? null);
  }
  async saveMcpSettings(settings: McpSettings) {
    await mutate((d) => upsert(sec(d).mcpSettings, settings, (m) => m.userId === settings.userId));
  }
  async listMcpSettings() {
    return clone((await read()).mcpSettings);
  }

  async listClients() {
    return clone((await read()).oauthClients);
  }
  async getClient(id: string) {
    return clone((await read()).oauthClients.find((c) => c.id === id) ?? null);
  }
  async saveClient(client: OAuthClient) {
    await mutate((d) => upsert(sec(d).oauthClients, client, (c) => c.id === client.id));
  }
  async deleteClient(id: string) {
    await mutate((d) => {
      const s = sec(d);
      s.oauthClients = s.oauthClients.filter((c) => c.id !== id);
      s.oauthGrants = s.oauthGrants.filter((g) => g.clientId !== id);
      s.oauthCodes = s.oauthCodes.filter((c) => c.clientId !== id);
    });
  }

  async saveCode(code: OAuthCode) {
    await mutate((d) => {
      const s = sec(d);
      // Expired codes are cleaned up on the way.
      const now = new Date().toISOString();
      s.oauthCodes = s.oauthCodes.filter((c) => c.expiresAt > now);
      s.oauthCodes.push(clone(code));
    });
  }
  async takeCode(codeHash: string) {
    return mutate((d) => {
      const s = sec(d);
      const found = s.oauthCodes.find((c) => c.codeHash === codeHash) ?? null;
      s.oauthCodes = s.oauthCodes.filter((c) => c.codeHash !== codeHash);
      return clone(found);
    });
  }

  async listGrants(userId: string) {
    return clone((await read()).oauthGrants.filter((g) => g.userId === userId));
  }
  async getGrant(id: string) {
    return clone((await read()).oauthGrants.find((g) => g.id === id) ?? null);
  }
  async grantByAccessHash(hash: string) {
    return clone((await read()).oauthGrants.find((g) => g.accessHash === hash) ?? null);
  }
  async grantByRefreshHash(hash: string) {
    return clone((await read()).oauthGrants.find((g) => g.refreshHash === hash) ?? null);
  }
  async saveGrant(grant: OAuthGrant) {
    await mutate((d) => upsert(sec(d).oauthGrants, grant, (g) => g.id === grant.id));
  }
  async updateGrant(id: string, patch: Partial<OAuthGrant>) {
    await mutate((d) => {
      const grant = sec(d).oauthGrants.find((g) => g.id === id);
      if (grant) Object.assign(grant, patch, { id });
    });
  }
  async rotateGrant(id: string, expectedRefreshHash: string, patch: Partial<OAuthGrant>) {
    return mutate((d) => {
      const grant = sec(d).oauthGrants.find((g) => g.id === id);
      if (!grant || grant.refreshHash !== expectedRefreshHash) return false;
      Object.assign(grant, patch, { id });
      return true;
    });
  }
}
