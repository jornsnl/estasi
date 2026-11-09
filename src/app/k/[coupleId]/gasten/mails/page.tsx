import { Notice } from "@/components/Notice";
import { GuestTabs } from "@/components/ws/GuestTabs";
import { MailLog } from "@/components/ws/MailLog";
import { requireCoupleAdmin, requirePlanning } from "@/lib/ws/access";

export const metadata = { title: "Mailgeschiedenis" };

export default async function CoupleMailHistory({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  // Feedback: the mail history is for Sabine only. A couple gets "not found", not just a hidden tab.
  await requirePlanning(coupleId);
  const { couple } = await requireCoupleAdmin(coupleId);
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Gastenlijst & RSVP</h1>
          <p className="mt-1 text-sm text-muted">
            Alle mails die Your Wedding Space voor dit bruidspaar heeft verstuurd, zoals de RSVP-bevestigingen aan de gasten. Mislukte mails kun je hier
            opnieuw versturen. Alleen jij ziet deze pagina.
          </p>
        </div>
        <GuestTabs coupleId={couple.id} current="mails" isAdmin />
      </header>
      <Notice searchParams={searchParams} />
      <MailLog coupleId={couple.id} isAdmin path={`/k/${couple.id}/gasten/mails`} filters={await searchParams} />
    </div>
  );
}
