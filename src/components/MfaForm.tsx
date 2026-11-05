"use client";

import { useActionState } from "react";
import { startMfaEnrollment, verifyMfa, type MfaState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

/**
 * Code entry for the second factor. When no app is linked yet, it first asks
 * Supabase for a QR code and keeps it in client state, so a mistyped code
 * does not replace the QR code the owner just scanned.
 */
export function MfaForm({ factorId, next }: { factorId: string | null; next: string }) {
  const [enrollment, enroll] = useActionState<MfaState>(startMfaEnrollment, {});
  const [result, verify] = useActionState(verifyMfa, {});
  const activeFactor = factorId ?? enrollment.factorId ?? null;
  const error = result.error ?? enrollment.error;

  if (!activeFactor) {
    return (
      <form action={enroll} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-bordeaux/30 bg-bordeaux-soft px-4 py-3 text-sm text-bordeaux">{error}</p>}
        <SubmitButton className="btn-primary w-full" pendingText="Bezig…">Authenticator app koppelen</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {enrollment.qrCode && (
        <div className="space-y-3 text-sm text-muted">
          <p>Scan de QR code met de app en vul daarna de code in die de app toont.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase */}
          <img src={enrollment.qrCode} alt="QR code voor je authenticator app" width={200} height={200} className="mx-auto rounded-md border border-line bg-white p-2" />
          <p>
            Lukt scannen niet? Vul deze sleutel handmatig in:
            <span className="mt-1 block rounded-md border border-line bg-white p-2 font-mono text-xs break-all text-ink select-all">{enrollment.secret}</span>
          </p>
        </div>
      )}
      <form action={verify} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-bordeaux/30 bg-bordeaux-soft px-4 py-3 text-sm text-bordeaux">{error}</p>}
        <input type="hidden" name="factorId" value={activeFactor} />
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="code" className="label">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="input tracking-widest" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Controleren…">{factorId ? "Inloggen" : "App koppelen"}</SubmitButton>
      </form>
    </div>
  );
}
