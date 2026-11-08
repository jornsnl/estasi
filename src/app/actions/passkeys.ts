"use server";

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import {
  authenticationOptions,
  completeRegistration,
  registrationOptions,
  startSupabaseSession,
  verifyAuthentication,
} from "@/lib/auth/passkeys";
import { hit, isLimited, LOGIN_PER_IP } from "@/lib/auth/rate-limit";
import { devAuthAllowed } from "@/lib/auth/dev-mode";
import { homeFor, requireOwner, startDevSession } from "@/lib/auth/session";
import { supabaseEnabled } from "@/lib/supabase/config";
import { getSecurityStore } from "@/lib/security/store";

const PROFILE = "/beheer/profiel";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "onbekend";
}

const safeNext = (value: unknown) => {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
};

export type PasskeyResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

// Registration (owner, from /beheer/profiel) ----------------------------------------------

export async function passkeyRegistrationOptions(): Promise<PasskeyResult<Awaited<ReturnType<typeof registrationOptions>>>> {
  const owner = await requireOwner();
  try {
    return { ok: true, value: await registrationOptions(owner) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function passkeyRegister(response: RegistrationResponseJSON, name: string): Promise<PasskeyResult> {
  const owner = await requireOwner();
  const label = String(name ?? "").trim().slice(0, 60);
  try {
    const passkey = await completeRegistration(owner, response, label);
    await audit(owner, "Passkey toegevoegd", passkey.name);
    return { ok: true, value: undefined };
  } catch (err) {
    console.warn(`[passkey] registreren mislukt: ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message || "De passkey kon niet worden opgeslagen." };
  }
}

export async function renamePasskey(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const store = getSecurityStore();
  const passkey = await store.getPasskey(id);
  if (passkey && passkey.userId === owner.id && name) await store.savePasskey({ ...passkey, name });
  redirect(`${PROFILE}?melding=${encodeURIComponent("Naam opgeslagen.")}#passkeys`);
}

export async function removePasskey(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const store = getSecurityStore();
  const passkey = await store.getPasskey(id);
  if (passkey && passkey.userId === owner.id) {
    await store.deletePasskey(id, owner.id);
    await audit(owner, "Passkey verwijderd", passkey.name);
  }
  redirect(`${PROFILE}?melding=${encodeURIComponent("Passkey verwijderd. Verwijder hem eventueel ook uit je wachtwoordbeheer.")}#passkeys`);
}

// Sign in (login page) --------------------------------------------------------------------

const TOO_MANY = "Te veel pogingen. Wacht een kwartier en probeer het opnieuw.";

export async function passkeyLoginOptions(): Promise<PasskeyResult<Awaited<ReturnType<typeof authenticationOptions>>>> {
  if (isLimited(`passkey:ip:${await clientIp()}`, LOGIN_PER_IP)) return { ok: false, error: TOO_MANY };
  return { ok: true, value: await authenticationOptions() };
}

export async function passkeyLogin(response: AuthenticationResponseJSON, next: string): Promise<PasskeyResult<string>> {
  const ipKey = `passkey:ip:${await clientIp()}`;
  if (isLimited(ipKey, LOGIN_PER_IP)) return { ok: false, error: TOO_MANY };
  const user = await verifyAuthentication(response);
  if (!user) {
    hit(ipKey, LOGIN_PER_IP);
    return { ok: false, error: "Deze passkey is niet bekend of kon niet worden gecontroleerd." };
  }
  if (supabaseEnabled()) {
    if (!(await startSupabaseSession(user))) return { ok: false, error: "Inloggen is niet gelukt. Probeer het opnieuw of log in met je wachtwoord." };
  } else if (devAuthAllowed()) {
    await startDevSession(user.id);
  } else {
    return { ok: false, error: "Inloggen is niet ingesteld op deze server." };
  }
  await audit(user, "Ingelogd met passkey");
  return { ok: true, value: safeNext(next) ?? homeFor(user) };
}
