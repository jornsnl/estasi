import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { currentAccount, homeFor } from "@/lib/auth/session";

export const metadata = { title: "Inloggen" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await currentAccount();
  if (account) redirect(homeFor(account));
  return (
    <>
      <h1 className="text-3xl">Welkom</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Log in om naar jullie Wedding Space te gaan.</p>
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
    </>
  );
}
