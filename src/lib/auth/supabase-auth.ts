import "server-only";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { User } from "@/lib/data";
import { isActivated } from "@/lib/domain/account";
import { appUrl } from "@/lib/supabase/config";
import { adminClient, authClient } from "@/lib/supabase/server";

/**
 * Account flows on Supabase Auth. Supabase sends the e-mails (invite and
 * password reset) through the SMTP server set in the Supabase dashboard.
 * The e-mail templates link to /auth/bevestigen with a token hash (see README),
 * so the link is checked on our server and no token ever sits in our tables.
 */

export const CONFIRM_PATH = "/auth/bevestigen";

/** Returns the Supabase user id, or null when the e-mail or password is wrong. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const { data, error } = await (await authClient()).auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // The visitor always sees the same message; the real reason goes to the server log
    // (for example invalid_credentials, email_not_confirmed or an invalid API key).
    console.warn(`[inloggen] ${email}: Supabase ${error?.status ?? ""} ${error?.code ?? ""} ${error?.message ?? "geen gebruiker"}`);
    return null;
  }
  return data.user.id;
}

/** Errors are swallowed on purpose: the answer must not reveal whether an address exists. */
export async function sendPasswordReset(email: string) {
  const { error } = await adminClient().auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}${CONFIRM_PATH}` });
  if (error) console.warn(`[wachtwoord herstellen] Supabase: ${error.message}`);
}

/** Creates the Supabase account and e-mails the invitation. Returns the new user id. */
export async function inviteAccount(email: string, name: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: `${appUrl()}${CONFIRM_PATH}`,
  });
  if (error || !data.user) throw new Error(`Uitnodiging versturen mislukt: ${error?.message ?? "onbekende fout"}`);
  return data.user.id;
}

/** Rolls back a Supabase account when saving the student failed halfway. */
export async function deleteAccount(userId: string) {
  await adminClient().auth.admin.deleteUser(userId);
}

/**
 * Sends a new invitation, or a password reset link once the account was used.
 * An invited user who opened the link but never chose a password can no longer
 * be invited again, so that case falls back to a reset link as well.
 */
export async function resendAccess(user: User): Promise<"invite" | "reset"> {
  if (!isActivated(user)) {
    const { error } = await adminClient().auth.admin.inviteUserByEmail(user.email, {
      redirectTo: `${appUrl()}${CONFIRM_PATH}`,
    });
    if (!error) return "invite";
  }
  const { error } = await adminClient().auth.resetPasswordForEmail(user.email, { redirectTo: `${appUrl()}${CONFIRM_PATH}` });
  if (error) throw new Error(`Versturen mislukt: ${error.message}`);
  return "reset";
}

const LINK_TYPES: EmailOtpType[] = ["invite", "recovery"];

export const isLinkType = (value: string): value is EmailOtpType => (LINK_TYPES as string[]).includes(value);

/** Checks the link from the e-mail and starts a session (sets the cookies). */
export async function verifyEmailLink(tokenHash: string, type: EmailOtpType): Promise<boolean> {
  const { error } = await (await authClient()).auth.verifyOtp({ token_hash: tokenHash, type });
  return !error;
}

/** Sets the password of the signed in user. Returns an error message or null. */
export async function updatePassword(password: string): Promise<string | null> {
  const { error } = await (await authClient()).auth.updateUser({ password });
  if (!error) return null;
  if (error.code === "same_password") return "Kies een ander wachtwoord dan je huidige.";
  if (error.code === "weak_password") return "Dit wachtwoord is te zwak of komt voor in bekende datalekken. Kies een ander.";
  return "Wachtwoord opslaan is niet gelukt. Vraag een nieuwe link aan en probeer het opnieuw.";
}
