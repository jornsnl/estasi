import { Notice } from "@/components/Notice";
import { GuestTabs } from "@/components/ws/GuestTabs";
import { MailLog } from "@/components/ws/MailLog";
import { requirePlanning } from "@/lib/ws/access";

export const metadata = { title: "Mailgeschiedenis" };

export default async function CoupleMailHistory({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Gastenlijst & RSVP</h1>
          <p className="mt-1 text-sm text-muted">
            Alle mails die Your Wedding Space voor jullie heeft verstuurd, zoals de RSVP-bevestigingen aan jullie gasten.
            {isAdmin ? " Mislukte mails kun je hier opnieuw versturen." : ""}
          </p>
        </div>
        <GuestTabs coupleId={couple.id} current="mails" />
      </header>
      <Notice searchParams={searchParams} />
      <MailLog coupleId={couple.id} isAdmin={isAdmin} path={`/k/${couple.id}/gasten/mails`} filters={await searchParams} />
    </div>
  );
}
