import { formBody, oauthError, preflight, CORS } from "@/lib/oauth/http";
import { authenticateClient, OAuthError, revokeToken } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";

/** RFC 7009 token revocation (an app disconnecting itself). */
export async function POST(request: Request) {
  const form = await formBody(request);
  try {
    const client = await authenticateClient(request, form);
    const token = form.get("token");
    if (token) await revokeToken(client, token);
    return new Response(null, { status: 200, headers: CORS });
  } catch (err) {
    if (!(err instanceof OAuthError)) throw err;
    return oauthError(err.code, err.message, err.status);
  }
}

export const OPTIONS = preflight;
