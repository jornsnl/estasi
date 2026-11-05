import { notFound, redirect } from "next/navigation";
import { setNewPassword } from "@/app/actions/auth";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { currentSession } from "@/lib/auth/session";
import { isSupabaseMode } from "@/lib/data";

export const metadata = { title: "Wachtwoord kiezen" };
// The backend (local or Supabase) is only known at runtime.
export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isSupabaseMode()) notFound();
  const current = await currentSession();
  if (!current) redirect("/auth/bevestigen?verlopen=1");

  // With an authenticator app set up, Supabase only changes the password after the code.
  if (current.needsCode) {
    redirect(`/tweestaps?next=${encodeURIComponent("/wachtwoord-instellen")}`);
  }

  const { user } = current;
  const isNew = !user.activatedAt;
  return (
    <>
      <h1 className="text-3xl">{isNew ? `Welkom, ${user.name.split(" ")[0]}` : "Nieuw wachtwoord"}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {isNew ? "Kies een wachtwoord om je account te activeren." : "Kies een nieuw wachtwoord voor je account."}
      </p>
      <Notice searchParams={searchParams} />
      <form action={setNewPassword} className="space-y-4">
        <div>
          <label htmlFor="password" className="label">Wachtwoord</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={200} required className="input" />
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
