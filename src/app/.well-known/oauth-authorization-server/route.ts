import { authorizationServerMetadata } from "@/lib/oauth/config";
import { json, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/** RFC 8414: where MCP clients find the authorization, token and registration endpoints. */
export const GET = () => json(authorizationServerMetadata(), 200, { "Cache-Control": "public, max-age=300" });
export const OPTIONS = preflight;
