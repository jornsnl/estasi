import { hit, isLimited } from "@/lib/auth/rate-limit";
import { json, oauthError, preflight, requestIp } from "@/lib/oauth/http";
import { isAllowedRedirectUri } from "@/lib/oauth/pure";
import { createClient, registrationOpen } from "@/lib/oauth/server";
import { getSecurityStore } from "@/lib/security/store";
import { getStore } from "@/lib/data";

export const dynamic = "force-dynamic";

const PER_IP = { max: 20, windowMs: 60 * 60_000 };
const UNUSED_CLIENT_MS = 24 * 60 * 60_000;

/**
 * RFC 7591 dynamic client registration, so an app such as Claude can
 * connect with only the server URL. Registering gives no access at all:
 * the owner still approves every connection on the consent screen.
 */
export async function POST(request: Request) {
  if (!(await registrationOpen())) {
    return oauthError("access_denied", "Registration is closed. Switch MCP on (and allow apps to register) on /beheer/profiel.", 403);
  }
  const key = `oauth:register:${await requestIp()}`;
  if (isLimited(key, PER_IP)) return oauthError("slow_down", "Too many registrations. Try again later.", 429);
  hit(key, PER_IP);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).slice(0, 10) : [];
  if (redirectUris.length === 0) return oauthError("invalid_redirect_uri", "redirect_uris is required.");
  const bad = redirectUris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return oauthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad.slice(0, 100)}`);
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return oauthError("invalid_client_metadata", "token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.");
  }
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return oauthError("invalid_client_metadata", "Only authorization_code and refresh_token are supported.");
  }

  await cleanUpUnusedClients();
  const { client, secret } = await createClient({
    name: typeof body.client_name === "string" ? body.client_name.trim() : "",
    redirectUris,
    confidential: method !== "none",
    source: "dynamic",
    clientUri: typeof body.client_uri === "string" ? body.client_uri : "",
  });
  return json(
    {
      client_id: client.id,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

/** Self-registered apps that were never approved disappear after a day. */
async function cleanUpUnusedClients() {
  const store = getSecurityStore();
  const owners = await getStore().listUsers("owner");
  const used = new Set((await Promise.all(owners.map((o) => store.listGrants(o.id)))).flat().map((g) => g.clientId));
  const cutoff = new Date(Date.now() - UNUSED_CLIENT_MS).toISOString();
  for (const client of await store.listClients()) {
    if (client.source === "dynamic" && client.createdAt < cutoff && !used.has(client.id)) await store.deleteClient(client.id);
  }
}

export const OPTIONS = preflight;
