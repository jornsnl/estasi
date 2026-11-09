import { appUrl } from "@/lib/supabase/config";
import type { OAuthScope } from "@/lib/security/types";

/**
 * OAuth 2.1 authorization server for the MCP connection. The app is both
 * the authorization server and the protected resource (/api/mcp).
 */

export const issuer = () => appUrl();
export const mcpResource = () => `${appUrl()}/api/mcp`;

export const ENDPOINTS = {
  authorize: "/oauth/authorize",
  token: "/api/oauth/token",
  register: "/api/oauth/register",
  revoke: "/api/oauth/revoke",
} as const;

export const SCOPES: OAuthScope[] = ["read", "write"];

export const SCOPE_LABELS: Record<OAuthScope, string> = {
  read: "Gegevens lezen: cursisten, voortgang, antwoorden, lesinhoud, bruidsparen, taken, agenda, leveranciers, kosten en RSVP's",
  write: "Gegevens wijzigen: feedback geven, notities en toegang aanpassen, taken, afspraken en antwoorden op vragen van bruidsparen",
};

export const CODE_TTL_MS = 5 * 60_000;
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;

/** Parses "read write" into known scopes; unknown ones are dropped. */
export function parseScope(value: string | null | undefined): OAuthScope[] {
  const wanted = (value ?? "").split(/\s+/).filter(Boolean);
  return SCOPES.filter((s) => wanted.includes(s));
}

/** Same resource, whatever trailing slash the client used. */
export function isOurResource(value: string): boolean {
  const clean = (v: string) => v.replace(/\/+$/, "");
  return clean(value) === clean(mcpResource()) || clean(value) === clean(appUrl());
}

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}${ENDPOINTS.authorize}`,
    token_endpoint: `${base}${ENDPOINTS.token}`,
    registration_endpoint: `${base}${ENDPOINTS.register}`,
    revocation_endpoint: `${base}${ENDPOINTS.revoke}`,
    scopes_supported: SCOPES,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/beheer/profiel`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Future Weddings Academy en Your Wedding Space",
    resource_documentation: `${issuer()}/beheer/profiel`,
  };
}
