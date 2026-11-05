import Link from "next/link";
import { choosePassword } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { findAccountLink } from "@/lib/data/accounts";

export const metadata = { title: "Wachtwoord kiezen" };
export const dynamic = "force-dynamic";

/**
 * Looking at the link does not use it up (mail scanners open links); only
 * choosing the password does.
 */
export default async function ActivatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const link = await findAccountLink(decodeURIComponent(token));
  if (!link) {
    return (
      <>
        <h1 className="text-3xl">Link niet geldig</h1>
        <p className="mt-2 text-sm text-muted">Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan, of neem contact op met Sabine.</p>
        <Notice searchParams={searchParams} />
        <Link href="/wachtwoord-vergeten" className="btn-primary mt-6 w-full">Nieuwe link aanvragen</Link>
      </>
    );
  }
  const isNew = !link.hasPassword;
  return (
    <>
      <h1 className="text-3xl">{isNew ? `Welkom, ${link.name.split(" ")[0]}` : "Nieuw wachtwoord"}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {isNew ? "Kies een wachtwoord om jullie Wedding Space te openen." : "Kies een nieuw wachtwoord."}
      </p>
      <Notice searchParams={searchParams} />
      <form action={choosePassword} className="space-y-4">
        <input type="hidden" name="token" value={decodeURIComponent(token)} />
        <div>
          <label htmlFor="password" className="label">Wachtwoord</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={200} required className="input" />
          <p className="hint">Minimaal {MIN_PASSWORD_LENGTH} tekens.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="label">Herhaal wachtwoord</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Opslaan…">{isNew ? "Wedding Space openen" : "Wachtwoord opslaan"}</SubmitButton>
      </form>
    </>
  );
}
