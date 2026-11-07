import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Server side signing key for small cookies (passkey challenge, passkey
 * session marker). Local mode uses SESSION_SECRET; with Supabase it is
 * derived from the secret key, which only this server knows.
 */
function rootSecret(): string {
  const supabaseKey = process.env.DATA_BACKEND === "supabase" ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;
  if (supabaseKey) return `supabase:${supabaseKey.trim()}`;
  const session = process.env.SESSION_SECRET;
  if (session && session.length >= 32) return `local:${session}`;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET of SUPABASE_SERVICE_ROLE_KEY ontbreekt.");
  return "lokale-ontwikkeling-alleen-niet-in-productie-gebruiken";
}

const keyFor = (purpose: string) => createHash("sha256").update(`${purpose}\u0000${rootSecret()}`).digest();

/** payload.signature, both base64url. The payload is JSON with an expiry (e, ms). */
export function signValue(purpose: string, value: object, ttlMs: number): string {
  const payload = Buffer.from(JSON.stringify({ ...value, e: Date.now() + ttlMs })).toString("base64url");
  const signature = createHmac("sha256", keyFor(purpose)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSigned<T extends object>(purpose: string, token: string | undefined): T | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", keyFor(purpose)).update(payload).digest("base64url"));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { e: number };
    return value.e > Date.now() ? value : null;
  } catch {
    return null;
  }
}

/** sha256 as hex, for tokens and secrets that are stored. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
