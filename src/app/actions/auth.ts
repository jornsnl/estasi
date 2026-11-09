"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/data";
import { devAuthAllowed, devLinkAccount, devSignIn, newDevSetupLink, setDevPassword } from "@/lib/auth/dev-auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { mustChangePassword, setMustChangePassword } from "@/lib/auth/temporary-password";
import { clear, hit, isLimited, LOGIN_PER_EMAIL, LOGIN_PER_IP, RESET_PER_IP } from "@/lib/auth/rate-limit";
import { currentSession, endSession, forgetFactors, homeFor, startDevSession } from "@/lib/auth/session";
import {
  isLinkType,
  sendPasswordReset,
  signInWithPassword,
  updatePassword,
  verifyEmailLink,
} from "@/lib/auth/supabase-auth";
import { authClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";

const safeNext = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
};

const back = (path: string, error: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}fout=${encodeURIComponent(error)}`);

async function clientIp(): Promise<string> {
  const h = await headers();
  // Render and Railway put the visitor's address first in X-Forwarded-For.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "onbekend";
}

const TOO_MANY = "Te veel inlogpogingen. Wacht een kwartier en probeer het opnieuw, of kies Wachtwoord vergeten.";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${await clientIp()}`;
  const next = safeNext(formData.get("next"));
  const loginPath = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  if (isLimited(emailKey, LOGIN_PER_EMAIL) || isLimited(ipKey, LOGIN_PER_IP)) back(loginPath, TOO_MANY);

  const store = getStore();
  const supabase = supabaseEnabled();
  if (!supabase && !devAuthAllowed()) {
    // Production without Supabase: there is no way to sign in, and the development login stays shut.
    console.error("[inloggen] SUPABASE_URL ontbreekt; inloggen is uitgeschakeld (de ontwikkel-login werkt niet in productie).");
    back(loginPath, "Inloggen is op dit moment niet mogelijk. Neem contact op met de beheerder.");
  }
  const userId = supabase ? await signInWithPassword(email, password) : await devSignIn(email, password);
  const user = userId ? await store.getUser(userId) : null;

  if (!user) {
    // A Supabase account without a row in users (for example made by hand) gets no access.
    if (userId && supabase) {
      console.warn(`[inloggen] ${email}: account bestaat in Supabase Auth maar niet in public.users (id ${userId})`);
      await endSession();
    }
    hit(emailKey, LOGIN_PER_EMAIL);
    hit(ipKey, LOGIN_PER_IP);
    back(loginPath, "Onbekend e-mailadres of onjuist wachtwoord.");
  }
  clear(emailKey);
  if (!supabase) await startDevSession(user!.id);
  // A temporary password from Sabine: first choose an own one.
  if (await mustChangePassword(user!.id)) redirect("/wachtwoord-instellen");
  // Back to where the visitor came from (for example the MCP consent screen).
  redirect(next ?? homeFor(user!));
}

export async function logout() {
  await endSession();
  redirect("/login");
}

const SETUP_TOKEN_DAYS = 3;

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const ipKey = `reset:ip:${await clientIp()}`;
  if (!isLimited(ipKey, RESET_PER_IP) && /^\S+@\S+\.\S+$/.test(email)) {
    hit(ipKey, RESET_PER_IP);
    const store = getStore();
    const user = await store.getUserByEmail(email);
    if (user && supabaseEnabled()) {
      await sendPasswordReset(user.email);
    } else if (user && devAuthAllowed()) {
      // The development login has no mail provider; the link goes to the server log.
      const link = await newDevSetupLink(user.id, SETUP_TOKEN_DAYS);
      console.info(`[wachtwoord herstellen] ${user.email}: ${link}`);
    }
  }
  // Same answer whether or not the address exists, so accounts cannot be probed.
  redirect(
    `/wachtwoord-vergeten?melding=${encodeURIComponent(
      "Als dit e-mailadres bij ons bekend is, ontvang je een link om een nieuw wachtwoord in te stellen.",
    )}`,
  );
}

function checkNewPassword(formData: FormData, path: string): string {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) back(path, `Kies een wachtwoord van minimaal ${MIN_PASSWORD_LENGTH} tekens.`);
  if (password.length > 200) back(path, "Kies een wachtwoord van maximaal 200 tekens.");
  if (password !== confirm) back(path, "De wachtwoorden komen niet overeen.");
  return password;
}

/** Development login: activation and reset via /activeren/[token]. */
export async function completeSetup(formData: FormData) {
  if (!devAuthAllowed()) redirect("/login");
  const token = String(formData.get("token") ?? "");
  const path = `/activeren/${token}`;
  const account = await devLinkAccount(token);
  if (!account) back(path, "Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan.");
  const password = checkNewPassword(formData, path);
  await setDevPassword(account!.user.id, password);
  await startDevSession(account!.user.id);
  redirect(homeFor(account!.user));
}

/**
 * Supabase: the link in the invite or reset e-mail. Checked on a button press
 * rather than on page load, so mail scanners that open links do not use it up.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!tokenHash || !isLinkType(type) || !(await verifyEmailLink(tokenHash, type))) {
    redirect("/auth/bevestigen?verlopen=1");
  }
  redirect("/wachtwoord-instellen");
}

/** Supabase: choose a password after following an invite or reset link. */
export async function setNewPassword(formData: FormData) {
  const path = "/wachtwoord-instellen";
  const current = await currentSession();
  if (!current) redirect("/auth/bevestigen?verlopen=1");
  const password = checkNewPassword(formData, path);
  if (supabaseEnabled()) {
    const problem = await updatePassword(password);
    if (problem) back(path, problem);
  } else if (devAuthAllowed()) {
    await setDevPassword(current.user.id, password);
  } else {
    redirect("/login");
  }
  await setMustChangePassword(current.user.id, false);
  if (!current.user.activatedAt) {
    await getStore().updateUser(current.user.id, { activatedAt: new Date().toISOString() });
  }
  redirect(homeFor(current.user));
}



export interface MfaState {
  error?: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/**
 * Supabase: start linking an authenticator app. Runs on a button press and
 * hands the QR code to the client form, so a wrong code does not make a new one.
 */
export async function startMfaEnrollment(): Promise<MfaState> {
  const current = await currentSession();
  if (!current) redirect("/login");
  const supabase = await authClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Clear half finished attempts first.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Future Weddings Academy",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) return { error: "Koppelen starten is niet gelukt. Probeer het opnieuw." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Supabase: check the six digit code (also completes a new authenticator app). */
export async function verifyMfa(previous: MfaState, formData: FormData): Promise<MfaState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNext(formData.get("next"));
  const current = await currentSession();
  if (!current) redirect("/login");

  const key = `mfa:${current.user.id}`;
  if (isLimited(key, LOGIN_PER_EMAIL)) return { ...previous, error: "Te veel onjuiste codes. Wacht een kwartier en probeer het opnieuw." };
  if (!/^\d{6}$/.test(code)) return { ...previous, error: "Vul de zescijferige code uit je authenticator app in." };

  const { error } = await (await authClient()).auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    hit(key, LOGIN_PER_EMAIL);
    return { ...previous, error: "Deze code klopt niet of is verlopen. Probeer de nieuwste code." };
  }
  clear(key);
  forgetFactors(current.user.id);
  redirect(next ?? homeFor(current.user));
}
