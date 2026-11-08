import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { getStore, type User } from "@/lib/data";
import { supabaseEnabled } from "@/lib/supabase/config";
import { getSecurityStore, type Passkey } from "@/lib/security/store";
import { appUrl } from "@/lib/supabase/config";
import { adminClient, authClient } from "@/lib/supabase/server";
import { readSigned, signValue } from "./signing";

/**
 * Passkeys (WebAuthn) for the owner account. A passkey is phishing proof
 * and always asks for the fingerprint, face or device PIN (user
 * verification), so a passkey sign-in counts as both factors: no extra
 * authenticator code is asked afterwards.
 *
 * With Supabase the passkey itself is checked here; after that the server
 * starts a normal Supabase session for the account (a one-time sign-in
 * link that is used right away and never e-mailed).
 */

const CHALLENGE_COOKIE = "academy_webauthn";
const CHALLENGE_TTL_MS = 5 * 60_000;
const MARKER_COOKIE = "academy_passkey";
const MARKER_TTL_MS = 60 * 60 * 24 * 30 * 1000;
export const MAX_PASSKEYS = 10;

const RP_NAME = "Wedding Plan Academy";

export function relyingParty() {
  const url = new URL(appUrl());
  return { rpID: url.hostname, origin: url.origin };
}

interface Challenge {
  c: string;
  k: "reg" | "auth";
  u?: string;
}

async function setChallenge(value: Challenge) {
  (await cookies()).set(CHALLENGE_COOKIE, signValue("webauthn-challenge", value, CHALLENGE_TTL_MS), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** Reads and clears the challenge, so every challenge can be used once. */
async function takeChallenge(kind: Challenge["k"]): Promise<Challenge | null> {
  const store = await cookies();
  const value = readSigned<Challenge>("webauthn-challenge", store.get(CHALLENGE_COOKIE)?.value);
  store.delete(CHALLENGE_COOKIE);
  return value && value.k === kind ? value : null;
}

// Registration ----------------------------------------------------------------------------

export async function registrationOptions(user: User): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await getSecurityStore().listPasskeys(user.id);
  if (existing.length >= MAX_PASSKEYS) throw new Error(`Je hebt al ${MAX_PASSKEYS} passkeys. Verwijder er eerst een.`);
  const { rpID } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    // Discoverable credential: sign in without typing the e-mail address.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })),
    preferredAuthenticatorType: "localDevice",
  });
  await setChallenge({ c: options.challenge, k: "reg", u: user.id });
  return options;
}

export async function completeRegistration(user: User, response: RegistrationResponseJSON, name: string): Promise<Passkey> {
  const challenge = await takeChallenge("reg");
  if (!challenge || challenge.u !== user.id) throw new Error("De aanvraag is verlopen. Probeer het opnieuw.");
  const { rpID, origin } = relyingParty();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.c,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo) throw new Error("De passkey kon niet worden gecontroleerd.");
  const info = result.registrationInfo;
  const store = getSecurityStore();
  if (await store.getPasskey(info.credential.id)) throw new Error("Deze passkey is al gekoppeld.");
  const passkey: Passkey = {
    id: info.credential.id,
    userId: user.id,
    publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
    counter: info.credential.counter,
    transports: info.credential.transports ?? response.response.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    name: name || "Passkey",
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await store.savePasskey(passkey);
  return passkey;
}

// Sign in ---------------------------------------------------------------------------------

export async function authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = relyingParty();
  // No allowCredentials: the browser offers the passkeys it has for this site.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  await setChallenge({ c: options.challenge, k: "auth" });
  return options;
}

/** Checks the passkey and returns its owner, or null. */
export async function verifyAuthentication(response: AuthenticationResponseJSON): Promise<User | null> {
  const challenge = await takeChallenge("auth");
  if (!challenge) return null;
  const store = getSecurityStore();
  const passkey = await store.getPasskey(response.id);
  if (!passkey) return null;
  const { rpID, origin } = relyingParty();
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch (err) {
    console.warn(`[passkey] controle mislukt: ${(err as Error).message}`);
    return null;
  }
  if (!result.verified) return null;
  await store.savePasskey({
    ...passkey,
    counter: result.authenticationInfo.newCounter,
    backedUp: result.authenticationInfo.credentialBackedUp,
    lastUsedAt: new Date().toISOString(),
  });
  const user = await getStore().getUser(passkey.userId);
  // Passkeys are for the owner account only.
  return user && user.role === "owner" ? user : null;
}

/**
 * Supabase: starts a session for the account whose passkey was just checked.
 * Returns false when Supabase does not cooperate.
 */
export async function startSupabaseSession(user: User): Promise<boolean> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error(`[passkey] sessie starten mislukt: ${error?.message ?? "geen token"}`);
    return false;
  }
  const verified = await (await authClient()).auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const sessionId = sessionIdOf(verified.data.session?.access_token);
  if (verified.error || !sessionId) {
    console.error(`[passkey] sessie starten mislukt: ${verified.error?.message ?? "geen sessie"}`);
    return false;
  }
  await markPasskeySession(user.id, sessionId);
  return true;
}

function sessionIdOf(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString()) as { session_id?: string };
    return claims.session_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Remembers that this Supabase session started with a passkey. Signed and
 * bound to the session id, so it cannot be moved to another session.
 */
async function markPasskeySession(userId: string, sessionId: string) {
  (await cookies()).set(MARKER_COOKIE, signValue("passkey-session", { u: userId, s: sessionId }, MARKER_TTL_MS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MARKER_TTL_MS / 1000,
  });
}

/** True when the current Supabase session was started with a passkey. */
export async function isPasskeySession(userId: string, sessionId: string | undefined): Promise<boolean> {
  if (!supabaseEnabled() || !sessionId) return false;
  const marker = readSigned<{ u: string; s: string }>("passkey-session", (await cookies()).get(MARKER_COOKIE)?.value);
  return Boolean(marker && marker.u === userId && marker.s === sessionId);
}

export async function clearPasskeyMarker() {
  (await cookies()).delete(MARKER_COOKIE);
}
