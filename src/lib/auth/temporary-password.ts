import "server-only";
import { randomInt } from "crypto";
import { one, query } from "@/lib/db";
import { MIN_PASSWORD_LENGTH } from "./password";

/**
 * Temporary password set by the owner for a student (an emergency option next
 * to the invite mail). The student must choose an own password after signing
 * in; until then public.users.must_change_password is true.
 */

// No look-alike characters (0/O, 1/l/I), so it can be read out or typed from a message.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A readable random password like "k7Pm-x3Qa-9Rtw" (12 characters plus dashes). */
export function generateTemporaryPassword(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return [part(), part(), part()].join("-");
}

/** Problem with a password Sabine typed herself, or null. */
export function temporaryPasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Kies een wachtwoord van minimaal ${MIN_PASSWORD_LENGTH} tekens.`;
  if (password.length > 200) return "Kies een wachtwoord van maximaal 200 tekens.";
  return null;
}

export async function mustChangePassword(userId: string): Promise<boolean> {
  const row = await one<{ must_change_password: boolean }>("select must_change_password from public.users where id = $1", [userId]);
  return Boolean(row?.must_change_password);
}

export async function setMustChangePassword(userId: string, value: boolean) {
  await query("update public.users set must_change_password = $2 where id = $1", [userId, value]);
}
