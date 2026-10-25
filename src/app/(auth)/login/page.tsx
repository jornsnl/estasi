import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { currentUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/data";
import { DEMO_PASSWORD } from "@/lib/data/seed";

export const metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser();
  if (user) redirect(user.role === "owner" ? "/beheer" : "/dashboard");

  return (
    <>
      <h1 className="text-3xl">Welkom terug</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Log in om verder te gaan met je opleiding.</p>
      <Notice searchParams={searchParams} />
      <form action={login} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">E-mailadres</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Wachtwoord</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Bezig met inloggen…">Inloggen</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/wachtwoord-vergeten" className="text-bordeaux hover:underline">Wachtwoord vergeten?</Link>
      </p>

      {isLocalMode() && (
        <div className="mt-8 rounded-lg border border-dashed border-gold/50 bg-gold-soft/50 p-4 text-sm">
          <p className="font-medium text-gold-ink">Lokale demo</p>
          <p className="mt-1 text-muted">Wachtwoord voor alle accounts: <code className="text-ink">{DEMO_PASSWORD}</code></p>
          <ul className="mt-2 space-y-0.5 text-muted">
            <li><code className="text-ink">sabine@estasiweddings.nl</code> opleider</li>
            <li><code className="text-ink">lotte@voorbeeld.nl</code> cursist, bezig</li>
            <li><code className="text-ink">noor@voorbeeld.nl</code> cursist, wacht op bevestiging</li>
            <li><code className="text-ink">eva@voorbeeld.nl</code> cursist, toegang verlopen</li>
          </ul>
        </div>
      )}
    </>
  );
}
