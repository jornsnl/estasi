import { protectedResourceMetadata } from "@/lib/oauth/config";
import { json, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/** RFC 9728: tells MCP clients which authorization server protects /api/mcp. */
export const GET = () => json(protectedResourceMetadata(), 200, { "Cache-Control": "public, max-age=300" });
export const OPTIONS = preflight;
