import { hit, isLimited } from "@/lib/auth/rate-limit";
import { formBody, json, oauthError, preflight, requestIp } from "@/lib/oauth/http";
import { authenticateClient, exchangeCode, OAuthError, refreshGrant } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";

const FAILURES_PER_IP = { max: 30, windowMs: 15 * 60_000 };

/** OAuth 2.1 token endpoint: authorization_code (with PKCE) and refresh_token. */
export async function POST(request: Request) {
  const key = `oauth:token:${await requestIp()}`;
  if (isLimited(key, FAILURES_PER_IP)) return oauthError("slow_down", "Too many failed attempts. Try again later.", 429);
  const form = await formBody(request);
  try {
    const client = await authenticateClient(request, form);
    switch (form.get("grant_type")) {
      case "authorization_code":
        return json(await exchangeCode(client, form));
      case "refresh_token":
        return json(await refreshGrant(client, form));
      default:
        return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
    }
  } catch (err) {
    if (!(err instanceof OAuthError)) throw err;
    hit(key, FAILURES_PER_IP);
    return oauthError(err.code, err.message, err.status, err.status === 401 ? { "WWW-Authenticate": 'Basic realm="oauth"' } : {});
  }
}

export const OPTIONS = preflight;
