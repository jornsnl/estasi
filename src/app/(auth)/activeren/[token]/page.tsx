import Link from "next/link";
import { completeSetup } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { getStore } from "@/lib/data";

export const metadata = { title: "Account activeren" };

export default async function ActivatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const user = await getStore().getUserBySetupToken(token);
  const valid = user?.setupTokenExpiresAt && new Date(user.setupTokenExpiresAt) > new Date();

  if (!user || !valid) {
    return (
      <>
        <h1 className="text-3xl">Link niet geldig</h1>
        <p className="mt-2 text-sm text-muted">Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan, of neem contact op met je opleider.</p>
        <Link href="/wachtwoord-vergeten" className="btn-primary mt-6 w-full">Nieuwe link aanvragen</Link>
      </>
    );
  }

  const isNew = !user.passwordHash;
  return (
    <>
      <h1 className="text-3xl">{isNew ? `Welkom, ${user.name.split(" ")[0]}` : "Nieuw wachtwoord"}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {isNew ? "Kies een wachtwoord om je account te activeren." : "Kies een nieuw wachtwoord voor je account."}
      </p>
      <Notice searchParams={searchParams} />
      <form action={completeSetup} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password" className="label">Wachtwoord</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className="input" />
          <p className="hint">Minimaal {MIN_PASSWORD_LENGTH} tekens.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="label">Herhaal wachtwoord</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Opslaan…">{isNew ? "Account activeren" : "Wachtwoord opslaan"}</SubmitButton>
      </form>
    </>
  );
}
