import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

// Checked when the account does not exist, so the response time does not
// reveal which e-mail addresses are known.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export function verifyPassword(password: string, stored: string | null): boolean {
  const [scheme, salt, hash] = (stored ?? DUMMY_HASH).split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual) && stored !== null;
}

export const MIN_PASSWORD_LENGTH = 10;

export const newToken = () => randomBytes(32).toString("base64url");
