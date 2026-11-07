"use client";

import { browserSupportsWebAuthn, startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import { passkeyLogin, passkeyLoginOptions } from "@/app/actions/passkeys";

/** "Inloggen met passkey": the browser offers the passkeys it has for this site. */
export function PasskeyLogin({ next }: { next: string }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const options = await passkeyLoginOptions();
      if (!options.ok) throw new Error(options.error);
      const response = await startAuthentication({ optionsJSON: options.value });
      const result = await passkeyLogin(response, next);
      if (!result.ok) throw new Error(result.error);
      window.location.assign(result.value);
    } catch (err) {
      // Closing the browser dialog is not an error worth shouting about.
      const cancelled = err instanceof WebAuthnError ? err.code === "ERROR_CEREMONY_ABORTED" : (err as Error).name === "NotAllowedError";
      setError(cancelled ? "Inloggen met passkey is afgebroken." : (err as Error).message || "Inloggen met passkey is niet gelukt.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        of
        <span className="h-px flex-1 bg-line" />
      </div>
      {error && <p role="alert" className="rounded-lg border border-bordeaux/30 bg-bordeaux-soft px-4 py-3 text-sm text-bordeaux">{error}</p>}
      <button type="button" onClick={signIn} disabled={busy} className="btn-secondary w-full">
        {busy ? "Bezig…" : "Inloggen met passkey"}
      </button>
    </div>
  );
}
