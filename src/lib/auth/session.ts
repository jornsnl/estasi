import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore, type User } from "@/lib/data";
import { supabaseEnabled } from "@/lib/supabase/config";
import { adminClient, authClient } from "@/lib/supabase/server";
import { assertDevAuth, devAuthAllowed } from "./dev-mode";
import { clearPasskeyMarker, isPasskeySession } from "./passkeys";

/**
 * Who is logged in.
 * - With Supabase (SUPABASE_URL set; always in production): Supabase Auth
 *   sessions (short access token plus refresh token in cookies, refreshed by
 *   src/middleware.ts), MFA for the owner.
 * - Development login (no SUPABASE_URL and not production): a signed cookie
 *   with the user id, see src/lib/auth/dev-auth.ts.
 * - Anything else (production without Supabase): nobody is logged in.
 */

// Development login -----------------------------------------------------------

const COOKIE = "academy_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET ontbreekt of is korter dan 32 tekens.");
  }
  return "lokale-ontwikkeling-alleen-niet-in-productie-gebruiken";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function encode(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; e: number };
    return e > Date.now() ? u : null;
  } catch {
    return null;
  }
}

/** Development login only (refuses otherwise); Supabase sets its own session cookies on sign in. */
export async function startDevSession(userId: string) {
  assertDevAuth();
  (await cookies()).set(COOKIE, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

// Sessions --------------------------------------------------------------------

interface SessionInfo {
  userId: string;
  /** "aal2" once the second factor was checked in this session (Supabase only). */
  aal: "aal1" | "aal2";
  /** The account has an authenticator app linked, but this session has not given the code yet. */
  needsCode: boolean;
}

async function session(): Promise<SessionInfo | null> {
  if (!supabaseEnabled()) {
    if (!devAuthAllowed()) return null;
    const userId = decode((await cookies()).get(COOKIE)?.value);
    return userId ? { userId, aal: "aal1", needsCode: false } : null;
  }
  // getClaims verifies the access token's signature; never trust the cookie as is.
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const sub = data.claims.sub;
  // A passkey is both factors at once (device plus fingerprint, face or PIN), so a session
  // started with one counts as checked. The marker is signed and bound to this session id.
  if (await isPasskeySession(sub, data.claims.session_id as string | undefined)) {
    return { userId: sub, aal: "aal2", needsCode: false };
  }
  const aal = data.claims.aal === "aal2" ? "aal2" : "aal1";
  // MFA is optional. Whoever linked an app must still give the code, otherwise the app protects nothing.
  // Whether an app is linked comes from Supabase itself, never from the cookie (which the visitor can edit).
  const needsCode = aal !== "aal2" && (await hasVerifiedFactor(sub));
  return { userId: sub, aal, needsCode };
}

// Linked authenticator apps, asked from Supabase Auth with the secret key and
// remembered for a minute so not every page view costs an extra request.
const FACTOR_TTL_MS = 60_000;
const factorState = globalThis as unknown as { __academyFactors?: Map<string, { value: boolean; until: number }> };
const factorCache = () => (factorState.__academyFactors ??= new Map());

export async function hasVerifiedFactor(userId: string): Promise<boolean> {
  const cached = factorCache().get(userId);
  if (cached && cached.until > Date.now()) return cached.value;
  const { data, error } = await adminClient().auth.admin.mfa.listFactors({ userId });
  // When Supabase cannot answer, assume an app is linked: asking for a code is the safe side.
  const value = error ? true : (data?.factors ?? []).some((f) => f.status === "verified");
  if (!error) factorCache().set(userId, { value, until: Date.now() + FACTOR_TTL_MS });
  return value;
}

/** After linking or removing an app, look it up again on the next request. */
export function forgetFactors(userId: string) {
  factorCache().delete(userId);
}

export async function endSession() {
  if (supabaseEnabled()) {
    // Revokes the refresh token at Supabase, so a copied cookie stops working.
    await (await authClient()).auth.signOut({ scope: "local" });
    await clearPasskeyMarker();
  } else {
    (await cookies()).delete(COOKIE);
  }
}

/** The signed in user, or null. Also null while a linked authenticator app still waits for its code. */
export async function currentUser(): Promise<User | null> {
  const info = await session();
  if (!info || info.needsCode) return null;
  return getStore().getUser(info.userId);
}

export async function requireUser(): Promise<User> {
  const info = await session();
  if (!info) redirect("/login");
  if (info.needsCode) redirect("/tweestaps");
  const user = await getStore().getUser(info.userId);
  if (!user) redirect("/login");
  return user;
}

export async function requireStudent(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "student") redirect(homeFor(user));
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "owner") redirect(homeFor(user));
  return user;
}

/** For the MFA and password pages: signed in, but a linked app may still wait for its code. */
export async function currentSession() {
  const info = await session();
  if (!info) return null;
  const user = await getStore().getUser(info.userId);
  return user ? { user, aal: info.aal, needsCode: info.needsCode } : null;
}

export const homeFor = (user: Pick<User, "role">) =>
  user.role === "owner" ? "/beheer" : user.role === "couple" ? "/k" : "/dashboard";
