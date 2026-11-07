import { CORS, json, preflight } from "@/lib/oauth/http";
import { issuer } from "@/lib/oauth/config";
import { verifyAccessToken } from "@/lib/oauth/server";
import { handleBody, LATEST_VERSION, SUPPORTED_VERSIONS } from "@/lib/mcp/protocol";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 1_000_000;

/** RFC 9728 / MCP authorization: tell the client where to log in. */
function unauthorized(hadToken: boolean) {
  const metadata = `${issuer()}/.well-known/oauth-protected-resource`;
  const challenge = hadToken
    ? `Bearer error="invalid_token", error_description="The access token is invalid or expired", resource_metadata="${metadata}"`
    : `Bearer resource_metadata="${metadata}", scope="read write"`;
  return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }, 401, { "WWW-Authenticate": challenge });
}

/**
 * MCP over Streamable HTTP. Stateless: each POST is answered with plain
 * JSON. Access needs a bearer token from our own OAuth server, issued after
 * the owner approved the app, and MCP switched on at /beheer/profiel.
 */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const caller = await verifyAccessToken(authorization);
  if (!caller) return unauthorized(Boolean(authorization));

  const version = request.headers.get("mcp-protocol-version");
  if (version && !SUPPORTED_VERSIONS.includes(version)) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Unsupported protocol version ${version}` } }, 400);
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const result = await handleBody(body, {
    user: caller.user,
    scope: caller.scope,
    clientName: caller.client?.name ?? "MCP",
  });
  if (result === null) return new Response(null, { status: 202, headers: CORS });
  return json(result, 200, { "Mcp-Protocol-Version": version ?? LATEST_VERSION });
}

/** No server-initiated stream: this server never sends requests or notifications of its own. */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export const DELETE = GET;
export const OPTIONS = preflight;
