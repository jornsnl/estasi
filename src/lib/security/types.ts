// Passkeys and the MCP connection (OAuth 2.1). Plain data, stored in the
// tables of migration 0016 (security/pg-store.ts).

/** A WebAuthn credential (passkey) of the owner. */
export interface Passkey {
  /** Credential id, base64url. */
  id: string;
  userId: string;
  /** COSE public key, base64url. */
  publicKey: string;
  /** Signature counter; most passkeys keep it at 0. */
  counter: number;
  transports: string[];
  /** "singleDevice" or "multiDevice" (synced, for example iCloud Keychain or Google Password Manager). */
  deviceType: string;
  backedUp: boolean;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** MCP settings of an owner account, set on /beheer/profiel. */
export interface McpSettings {
  userId: string;
  enabled: boolean;
  /** Whether connected apps may change data (scope "write"). Reading is always allowed when enabled. */
  allowWrite: boolean;
  /** Allow apps such as Claude to register themselves (OAuth dynamic client registration). */
  allowRegistration: boolean;
  updatedAt: string;
}

export type OAuthScope = "read" | "write";

export interface OAuthClient {
  id: string;
  name: string;
  /** sha256 of the client secret, or null for a public client (PKCE only). */
  secretHash: string | null;
  redirectUris: string[];
  /** "dynamic" (registered itself) or "manual" (made on /beheer/profiel). */
  source: "dynamic" | "manual";
  clientUri: string;
  createdAt: string;
}

/** One-time authorization code, valid for a few minutes. */
export interface OAuthCode {
  /** sha256 of the code. */
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: OAuthScope[];
  resource: string;
  expiresAt: string;
}

/** A connected app: the owner approved it once; tokens rotate inside the grant. */
export interface OAuthGrant {
  id: string;
  clientId: string;
  userId: string;
  scope: OAuthScope[];
  resource: string;
  accessHash: string;
  accessExpiresAt: string;
  refreshHash: string;
  refreshExpiresAt: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
