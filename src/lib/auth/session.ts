import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore, isSupabaseMode, type User } from "@/lib/data";
import { authClient } from "@/lib/supabase/server";

/**
 * Who is logged in. Two backends:
 * - local: a signed cookie with the user id (development and demos)
 * - supabase: Supabase Auth sessions (short access token plus refresh
 *   token in cookies, refreshed by src/middleware.ts), MFA for the owner
 */

// Local mode ------------------------------------------------------------------

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

/** Local mode only; Supabase sets its own session cookies on sign in. */
export async function startLocalSession(userId: string) {
  (await cookies()).set(COOKIE, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

// Both modes ------------------------------------------------------------------

interface SessionInfo {
  userId: string;
  /** "aal2" once the second factor was checked in this session (Supabase only). */
  aal: "aal1" | "aal2";
}

async function session(): Promise<SessionInfo | null> {
  if (!isSupabaseMode()) {
    const userId = decode((await cookies()).get(COOKIE)?.value);
    return userId ? { userId, aal: "aal1" } : null;
  }
  // getClaims verifies the access token's signature; never trust the cookie as is.
  const { data, error } = await (await authClient()).auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { userId: data.claims.sub, aal: data.claims.aal === "aal2" ? "aal2" : "aal1" };
}

export async function endSession() {
  if (isSupabaseMode()) {
    // Revokes the refresh token at Supabase, so a copied cookie stops working.
    await (await authClient()).auth.signOut({ scope: "local" });
  } else {
    (await cookies()).delete(COOKIE);
  }
}

export async function currentUser(): Promise<User | null> {
  const info = await session();
  if (!info) return null;
  return getStore().getUser(info.userId);
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStudent(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "student") redirect("/beheer");
  return user;
}

/** The owner sees every student's data, so with Supabase a second factor is required. */
export async function requireOwner(): Promise<User> {
  const info = await session();
  if (!info) redirect("/login");
  const user = await getStore().getUser(info.userId);
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/dashboard");
  if (isSupabaseMode() && info.aal !== "aal2") redirect("/tweestaps");
  return user;
}

/** For the MFA page itself: signed in, but the second factor may still be missing. */
export async function currentSession() {
  const info = await session();
  if (!info) return null;
  const user = await getStore().getUser(info.userId);
  return user ? { user, aal: info.aal } : null;
}

export const homeFor = (user: User) => (user.role === "owner" ? "/beheer" : "/dashboard");
