"use client";

import { browserSupportsWebAuthn, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { passkeyRegister, passkeyRegistrationOptions } from "@/app/actions/passkeys";

/** Adds a passkey to the owner account (fingerprint, face, device PIN or a security key). */
export function PasskeyRegister() {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  if (supported === false) {
    return <p className="text-sm text-muted">Deze browser ondersteunt geen passkeys. Probeer een recente versie van Safari, Chrome, Edge of Firefox.</p>;
  }

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const options = await passkeyRegistrationOptions();
      if (!options.ok) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options.value });
      const result = await passkeyRegister(response, name || defaultName());
      if (!result.ok) throw new Error(result.error);
      setName("");
      setMessage({ ok: true, text: "Passkey toegevoegd. Je kunt hem nu gebruiken op het inlogscherm." });
      router.refresh();
    } catch (err) {
      const text =
        err instanceof WebAuthnError && err.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
          ? "Dit apparaat heeft al een passkey voor dit account."
          : (err as Error).name === "NotAllowedError" || (err instanceof WebAuthnError && err.code === "ERROR_CEREMONY_ABORTED")
            ? "Toevoegen is afgebroken."
            : (err as Error).message || "Toevoegen is niet gelukt.";
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-success/20 bg-success-soft text-success" : "border-bordeaux/30 bg-bordeaux-soft text-bordeaux"}`}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="passkeyName" className="label">Naam (optioneel)</label>
          <input id="passkeyName" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Bijvoorbeeld: iPhone van Sabine" className="input" />
        </div>
        <button type="button" onClick={add} disabled={busy || supported === null} className="btn-primary">
          {busy ? "Bezig…" : "Passkey toevoegen"}
        </button>
      </div>
    </div>
  );
}

function defaultName() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Apparaat";
  return `${device}, ${new Date().toLocaleDateString("nl-NL")}`;
}
