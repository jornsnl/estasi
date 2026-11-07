import "server-only";
import { randomBytes, randomUUID } from "crypto";
import { getStore, type User } from "@/lib/data";
import { sha256 } from "@/lib/auth/signing";
import { getSecurityStore, type McpSettings, type OAuthClient, type OAuthGrant, type OAuthScope } from "@/lib/security/store";
import { ACCESS_TTL_MS, CODE_TTL_MS, isOurResource, mcpResource, REFRESH_TTL_MS } from "./config";
import { basicCredentials, pkceMatches, redirectUriMatches } from "./pure";

const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// Settings --------------------------------------------------------------------------------

export const DEFAULT_MCP_SETTINGS = (userId: string): McpSettings => ({
  userId,
  enabled: false,
  allowWrite: false,
  allowRegistration: true,
  updatedAt: new Date().toISOString(),
});

export async function mcpSettingsFor(userId: string): Promise<McpSettings> {
  return (await getSecurityStore().getMcpSettings(userId)) ?? DEFAULT_MCP_SETTINGS(userId);
}

/** Dynamic registration is open while at least one owner has MCP on with registration allowed. */
export async function registrationOpen(): Promise<boolean> {
  return (await getSecurityStore().listMcpSettings()).some((s) => s.enabled && s.allowRegistration);
}

// Clients ---------------------------------------------------------------------------------

export async function createClient(input: {
  name: string;
  redirectUris: string[];
  confidential: boolean;
  source: OAuthClient["source"];
  clientUri?: string;
}): Promise<{ client: OAuthClient; secret: string | null }> {
  const secret = input.confidential ? token("wpa_cs") : null;
  const client: OAuthClient = {
    id: `wpa_c_${randomBytes(16).toString("base64url")}`,
    name: input.name.slice(0, 100) || "MCP-app",
    secretHash: secret ? sha256(secret) : null,
    redirectUris: input.redirectUris,
    source: input.source,
    clientUri: (input.clientUri ?? "").slice(0, 300),
    createdAt: new Date().toISOString(),
  };
  await getSecurityStore().saveClient(client);
  return { client, secret };
}

/** Client authentication at the token and revoke endpoints. */
export async function authenticateClient(request: Request, form: URLSearchParams): Promise<OAuthClient> {
  const basic = basicCredentials(request.headers.get("authorization"));
  const id = basic?.id ?? form.get("client_id") ?? "";
  const secret = basic?.secret ?? form.get("client_secret") ?? "";
  const client = id ? await getSecurityStore().getClient(id) : null;
  if (!client) throw new OAuthError("invalid_client", "Onbekende client.", 401);
  if (client.secretHash && sha256(secret) !== client.secretHash) throw new OAuthError("invalid_client", "Onjuist client secret.", 401);
  return client;
}

// Authorization codes ---------------------------------------------------------------------

export interface AuthorizeRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: OAuthScope[];
  resource: string;
}

/**
 * Checks the query of /oauth/authorize. Errors with the client or the
 * redirect URI are shown on screen (never redirect to an unknown URI);
 * the rest goes back to the client as ?error=.
 */
export async function parseAuthorizeRequest(params: URLSearchParams): Promise<
  { ok: true; value: AuthorizeRequest } | { ok: false; screen: string } | { ok: false; redirect: string }
> {
  const client = await getSecurityStore().getClient(params.get("client_id") ?? "");
  if (!client) return { ok: false, screen: "Deze app is niet (meer) bekend. Verbind de app opnieuw." };
  const redirectUri = params.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri)) {
    return { ok: false, screen: "De terugverwijzing van deze app klopt niet met wat de app bij het aanmelden opgaf." };
  }
  const state = params.get("state") ?? "";
  const back = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return { ok: false as const, redirect: url.toString() };
  };
  if (params.get("response_type") !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  const codeChallenge = params.get("code_challenge") ?? "";
  if (!codeChallenge || params.get("code_challenge_method") !== "S256") return back("invalid_request", "PKCE with S256 is required.");
  const resource = params.get("resource") ?? mcpResource();
  if (!isOurResource(resource)) return back("invalid_target", "Unknown resource.");
  const requested = (params.get("scope") ?? "").trim();
  const scope = requested ? (["read", "write"] as OAuthScope[]).filter((s) => requested.split(/\s+/).includes(s)) : (["read", "write"] as OAuthScope[]);
  if (requested && scope.length === 0) return back("invalid_scope", "Supported scopes: read write.");
  return { ok: true, value: { client, redirectUri, state, codeChallenge, scope, resource } };
}

export async function issueCode(request: AuthorizeRequest, user: User, scope: OAuthScope[]): Promise<string> {
  const code = token("wpa_code");
  await getSecurityStore().saveCode({
    codeHash: sha256(code),
    clientId: request.client.id,
    userId: user.id,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope,
    resource: request.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return code;
}

// Tokens ----------------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function freshTokens() {
  const access = token("wpa_at");
  const refresh = token("wpa_rt");
  const now = Date.now();
  return {
    access,
    refresh,
    patch: {
      accessHash: sha256(access),
      accessExpiresAt: new Date(now + ACCESS_TTL_MS).toISOString(),
      refreshHash: sha256(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS).toISOString(),
    },
  };
}

const response = (access: string, refresh: string, scope: OAuthScope[]): TokenResponse => ({
  access_token: access,
  token_type: "Bearer",
  expires_in: Math.floor(ACCESS_TTL_MS / 1000),
  refresh_token: refresh,
  scope: scope.join(" "),
});

export async function exchangeCode(client: OAuthClient, form: URLSearchParams): Promise<TokenResponse> {
  const code = form.get("code") ?? "";
  const stored = code ? await getSecurityStore().takeCode(sha256(code)) : null;
  if (!stored || stored.clientId !== client.id || stored.expiresAt < new Date().toISOString()) {
    throw new OAuthError("invalid_grant", "De code is ongeldig, verlopen of al gebruikt.");
  }
  const redirectUri = form.get("redirect_uri");
  if (redirectUri && redirectUri !== stored.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri komt niet overeen.");
  if (!pkceMatches(form.get("code_verifier") ?? "", stored.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE-controle mislukt.");
  const resource = form.get("resource");
  if (resource && !isOurResource(resource)) throw new OAuthError("invalid_target", "Onbekende resource.");

  const { access, refresh, patch } = freshTokens();
  const grant: OAuthGrant = {
    id: randomUUID(),
    clientId: client.id,
    userId: stored.userId,
    scope: stored.scope,
    resource: stored.resource,
    ...patch,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await getSecurityStore().saveGrant(grant);
  return response(access, refresh, grant.scope);
}

export async function refreshGrant(client: OAuthClient, form: URLSearchParams): Promise<TokenResponse> {
  const refreshToken = form.get("refresh_token") ?? "";
  const store = getSecurityStore();
  const hash = sha256(refreshToken);
  const grant = refreshToken ? await store.grantByRefreshHash(hash) : null;
  if (!grant || grant.clientId !== client.id || grant.revokedAt || grant.refreshExpiresAt < new Date().toISOString()) {
    throw new OAuthError("invalid_grant", "Het refresh token is ongeldig of verlopen.");
  }
  // A smaller scope may be asked for, never a bigger one.
  const asked = form.get("scope");
  const scope = asked ? grant.scope.filter((s) => asked.split(/\s+/).includes(s)) : grant.scope;
  const { access, refresh, patch } = freshTokens();
  if (!(await store.rotateGrant(grant.id, hash, { ...patch, scope }))) {
    throw new OAuthError("invalid_grant", "Het refresh token is al gebruikt.");
  }
  return response(access, refresh, scope);
}

/** RFC 7009: revoke an access or refresh token; unknown tokens are not an error. */
export async function revokeToken(client: OAuthClient, value: string) {
  const store = getSecurityStore();
  const hash = sha256(value);
  const grant = (await store.grantByRefreshHash(hash)) ?? (await store.grantByAccessHash(hash));
  if (grant && grant.clientId === client.id && !grant.revokedAt) {
    await store.updateGrant(grant.id, { revokedAt: new Date().toISOString() });
  }
}

// Protected resource ----------------------------------------------------------------------

export interface McpCaller {
  user: User;
  grant: OAuthGrant;
  client: OAuthClient | null;
  /** Effective scopes: what the grant has, limited by the current MCP settings. */
  scope: OAuthScope[];
}

const TOUCH_MS = 5 * 60_000;

/** Checks a bearer token for /api/mcp. Null means 401. */
export async function verifyAccessToken(authorization: string | null): Promise<McpCaller | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const store = getSecurityStore();
  const grant = await store.grantByAccessHash(sha256(match[1]));
  if (!grant || grant.revokedAt || grant.accessExpiresAt < new Date().toISOString()) return null;
  if (!isOurResource(grant.resource || mcpResource())) return null;
  const user = await getStore().getUser(grant.userId);
  if (!user || user.role !== "owner") return null;
  const settings = await mcpSettingsFor(user.id);
  if (!settings.enabled) return null;
  const scope = grant.scope.filter((s) => s === "read" || (s === "write" && settings.allowWrite));
  if (!grant.lastUsedAt || Date.now() - new Date(grant.lastUsedAt).getTime() > TOUCH_MS) {
    await store.updateGrant(grant.id, { lastUsedAt: new Date().toISOString() });
  }
  return { user, grant, client: await store.getClient(grant.clientId), scope };
}
