import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore, type User } from "@/lib/data";

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

export async function startSession(userId: string) {
  (await cookies()).set(COOKIE, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const userId = decode((await cookies()).get(COOKIE)?.value);
  if (!userId) return null;
  return getStore().getUser(userId);
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

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/dashboard");
  return user;
}
