import { notFound, redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { MfaForm } from "@/components/MfaForm";
import { currentSession, homeFor } from "@/lib/auth/session";
import { isSupabaseMode } from "@/lib/data";
import { authClient } from "@/lib/supabase/server";

export const metadata = { title: "Tweestapsverificatie" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/**
 * Second factor for the owner account. First visit: link an authenticator
 * app with a QR code. After that: the six digit code on every new sign in.
 */
export default async function MfaPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isSupabaseMode()) notFound();
  const current = await currentSession();
  if (!current) redirect("/login");

  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";
  if (current.aal === "aal2") redirect(next || homeFor(current.user));

  const { data: factors, error } = await (await authClient()).auth.mfa.listFactors();
  if (error) throw new Error(`Supabase MFA: ${error.message}`);
  const verified = factors.totp.find((f) => f.status === "verified");

  return (
    <>
      <h1 className="text-3xl">Tweestapsverificatie</h1>
      {verified ? (
        <p className="mt-1 mb-6 text-sm text-muted">Vul de zescijferige code uit je authenticator app in.</p>
      ) : (
        <p className="mt-1 mb-6 text-sm text-muted">
          Het beheeraccount ziet de gegevens van alle cursisten. Daarom vragen we naast je wachtwoord een code uit een
          authenticator app, zoals Google Authenticator, Microsoft Authenticator of 1Password.
        </p>
      )}
      <MfaForm factorId={verified?.id ?? null} next={next} />
      <form action={logout} className="mt-4 text-center">
        <button type="submit" className="text-sm text-bordeaux hover:underline">Uitloggen</button>
      </form>
    </>
  );
}
