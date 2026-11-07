import "server-only";
import { headers } from "next/headers";

/**
 * Small helpers for the OAuth and MCP endpoints. They use bearer tokens,
 * never cookies, so any origin may call them (browser based MCP clients).
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...CORS, ...extra },
  });
}

export const oauthError = (code: string, description: string, status = 400, extra: Record<string, string> = {}) =>
  json({ error: code, error_description: description }, status, extra);

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Form or JSON body as URLSearchParams (OAuth uses forms; some clients send JSON). */
export async function formBody(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  const text = (await request.text()).slice(0, 20_000);
  if (type.includes("application/json")) {
    try {
      const value = JSON.parse(text) as Record<string, unknown>;
      return new URLSearchParams(Object.entries(value).map(([k, v]) => [k, String(v ?? "")]));
    } catch {
      return new URLSearchParams();
    }
  }
  return new URLSearchParams(text);
}

export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "onbekend";
}
