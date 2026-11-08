import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { PasskeyLogin } from "@/components/PasskeyLogin";
import { SubmitButton } from "@/components/SubmitButton";
import { currentUser, homeFor } from "@/lib/auth/session";

export const metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "";
  const user = await currentUser();
  if (user) redirect(next || homeFor(user));

  return (
    <>
      <h1 className="text-3xl">Welkom terug</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Log in voor de Academy of jullie Wedding Space.</p>
      <Notice searchParams={searchParams} />
      <form action={login} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label htmlFor="email" className="label">E-mailadres</label>
          <input id="email" name="email" type="email" autoComplete="username webauthn" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Wachtwoord</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Bezig met inloggen…">Inloggen</SubmitButton>
      </form>
      <PasskeyLogin next={next} />
      <p className="mt-4 text-center text-sm">
        <Link href="/wachtwoord-vergeten" className="text-bordeaux hover:underline">Wachtwoord vergeten?</Link>
      </p>

    </>
  );
}
