import { protectedResourceMetadata } from "@/lib/oauth/config";
import { json, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/** The path-suffixed form of RFC 9728: /.well-known/oauth-protected-resource/api/mcp */
export const GET = () => json(protectedResourceMetadata(), 200, { "Cache-Control": "public, max-age=300" });
export const OPTIONS = preflight;
