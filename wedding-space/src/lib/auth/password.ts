import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

// Checked when the account does not exist, so response times do not reveal known addresses.
const DUMMY = hashPassword(randomBytes(16).toString("hex"));

export function verifyPassword(password: string, stored: string | null): boolean {
  const [scheme, salt, hash] = (stored ?? DUMMY).split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const ok = timingSafeEqual(expected, scryptSync(password, salt, expected.length));
  return ok && stored !== null;
}
