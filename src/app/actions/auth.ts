"use server";

import { redirect } from "next/navigation";
import { getStore, isLocalMode } from "@/lib/data";
import { hashPassword, MIN_PASSWORD_LENGTH, newToken, verifyPassword } from "@/lib/auth/password";
import { endSession, startSession } from "@/lib/auth/session";

const back = (path: string, error: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}fout=${encodeURIComponent(error)}`);

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await getStore().getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    back("/login", "Onbekend e-mailadres of onjuist wachtwoord.");
  }
  await startSession(user!.id);
  redirect(user!.role === "owner" ? "/beheer" : "/dashboard");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

const SETUP_TOKEN_HOURS = 72;

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const store = getStore();
  const user = await store.getUserByEmail(email);
  if (user) {
    const token = newToken();
    await store.updateUser(user.id, {
      setupToken: token,
      setupTokenExpiresAt: new Date(Date.now() + SETUP_TOKEN_HOURS * 3_600_000).toISOString(),
    });
    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/activeren/${token}`;
    // Fase 1 has no mail provider yet; in local mode the link goes to the server log.
    if (isLocalMode()) console.info(`[wachtwoord herstellen] ${user.email}: ${link}`);
  }
  // Same answer whether or not the address exists, so accounts cannot be probed.
  redirect(
    `/wachtwoord-vergeten?melding=${encodeURIComponent(
      "Als dit e-mailadres bij ons bekend is, ontvang je een link om een nieuw wachtwoord in te stellen.",
    )}`,
  );
}

export async function completeSetup(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const path = `/activeren/${token}`;
  const store = getStore();
  const user = await store.getUserBySetupToken(token);
  if (!user || !user.setupTokenExpiresAt || new Date(user.setupTokenExpiresAt) < new Date()) {
    back(path, "Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) back(path, `Kies een wachtwoord van minimaal ${MIN_PASSWORD_LENGTH} tekens.`);
  if (password !== confirm) back(path, "De wachtwoorden komen niet overeen.");
  await store.updateUser(user!.id, {
    passwordHash: hashPassword(password),
    setupToken: null,
    setupTokenExpiresAt: null,
  });
  await startSession(user!.id);
  redirect(user!.role === "owner" ? "/beheer" : "/dashboard");
}
