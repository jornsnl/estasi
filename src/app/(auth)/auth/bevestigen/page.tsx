import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmEmailLink } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { isSupabaseMode } from "@/lib/data";

export const metadata = { title: "Link bevestigen" };
// The backend (local or Supabase) is only known at runtime.
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Landing page for the links in the invite and reset e-mails. The link is only
 * used when the visitor presses the button, so a mail scanner that opens every
 * link cannot use it up before the student does.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isSupabaseMode()) notFound();
  const params = await searchParams;
  const tokenHash = one(params.token_hash);
  const type = one(params.type);

  if (one(params.verlopen) || !tokenHash || !type) {
    return (
      <>
        <h1 className="text-3xl">Link niet geldig</h1>
        <p className="mt-2 text-sm text-muted">
          Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan, of neem contact op met je opleider.
        </p>
        <Link href="/wachtwoord-vergeten" className="btn-primary mt-6 w-full">Nieuwe link aanvragen</Link>
      </>
    );
  }

  const isInvite = type === "invite";
  return (
    <>
      <h1 className="text-3xl">{isInvite ? "Account activeren" : "Nieuw wachtwoord"}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {isInvite
          ? "Welkom bij de Wedding Plan Academy. Ga verder om een wachtwoord te kiezen."
          : "Ga verder om een nieuw wachtwoord te kiezen."}
      </p>
      <form action={confirmEmailLink}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <SubmitButton className="btn-primary w-full" pendingText="Controleren…">Doorgaan</SubmitButton>
      </form>
    </>
  );
}
