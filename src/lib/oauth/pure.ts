import { createHash, timingSafeEqual } from "crypto";

/** Pure OAuth helpers, covered by tests/oauth.test.ts. */

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Redirect URIs a client may register: https anywhere, http only on the
 * own computer (desktop apps), or a custom app scheme such as cursor://.
 * No fragments, no javascript: or data: tricks.
 */
export function isAllowedRedirectUri(value: string): boolean {
  if (value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname);
  if (["javascript:", "data:", "file:", "blob:", "vbscript:", "about:", "ftp:", "ws:", "wss:"].includes(url.protocol)) return false;
  // Private-use schemes (RFC 8252), for example vscode: or cursor:
  return /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol);
}

/**
 * Loopback redirects may use any port (RFC 8252, section 7.3): the app
 * picks a free one each time. Everything else must match exactly.
 */
export function redirectUriMatches(registered: string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || !LOOPBACK.has(url.hostname)) return false;
  return registered.some((r) => {
    try {
      const reg = new URL(r);
      return reg.protocol === "http:" && reg.hostname === url.hostname && reg.pathname === url.pathname && reg.search === url.search;
    } catch {
      return false;
    }
  });
}

/** Client credentials from an Authorization: Basic header (RFC 6749, 2.3.1). */
export function basicCredentials(header: string | null): { id: string; secret: string } | null {
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString();
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return { id: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) };
  } catch {
    return null;
  }
}
