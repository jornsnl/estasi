import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { isLocalMode } from "@/lib/data";

export const metadata = { title: "Wachtwoord vergeten" };

export default function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <h1 className="text-3xl">Wachtwoord vergeten</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Vul je e-mailadres in. Je ontvangt een link om een nieuw wachtwoord te kiezen.</p>
      <Notice searchParams={searchParams} />
      <form action={requestPasswordReset} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">E-mailadres</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Versturen…">Stuur herstellink</SubmitButton>
      </form>
      {isLocalMode() && (
        <p className="mt-4 text-xs text-muted">Lokale modus: er wordt nog geen e-mail verstuurd. De link verschijnt in de serverlog.</p>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-bordeaux hover:underline">Terug naar inloggen</Link>
      </p>
    </>
  );
}
