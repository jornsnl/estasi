import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Conversation } from "@/components/community/Conversation";
import { Notice } from "@/components/Notice";
import { requireOwner } from "@/lib/auth/session";
import { listMessages, markConversationRead, viewerFor } from "@/lib/community/server";
import { getStore } from "@/lib/data";
import { accessStatus, ACCESS_LABELS } from "@/lib/domain/access";
import { isUuid } from "@/lib/db";

export const metadata = { title: "Privébericht" };

type Search = Record<string, string | string[] | undefined>;

export default async function OwnerConversationPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<Search> }) {
  const viewer = await viewerFor(await requireOwner());
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const student = await getStore().getUser(userId);
  if (!student || student.role !== "student") notFound();
  const [messages, enrollment] = await Promise.all([listMessages(viewer, userId), getStore().getEnrollmentForUser(userId)]);
  await markConversationRead(viewer, userId);
  const access = enrollment ? accessStatus(enrollment) : null;

  return (
    <div className="max-w-3xl">
      <Link href="/beheer/berichten" className="text-sm text-bordeaux hover:underline">
        ← Alle privéberichten
      </Link>
      <h1 className="mt-2 text-4xl">{student.name}</h1>
      <p className="mt-1 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{student.email}</span>
        {access && <Badge tone={access === "active" ? "success" : "bordeaux"}>Toegang: {ACCESS_LABELS[access]}</Badge>}
        <Link href={`/beheer/cursisten/${student.id}`} className="text-bordeaux hover:underline">
          Naar de cursist
        </Link>
      </p>
      {access && access !== "active" && (
        <p className="mb-4 rounded-lg border border-gold/30 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          Deze cursist heeft geen actieve toegang: de community is dicht, maar dit gesprek kan ze lezen en beantwoorden.
        </p>
      )}
      <Notice searchParams={searchParams} />
      <Conversation
        viewerId={viewer.id}
        studentId={student.id}
        messages={messages}
        canWrite
        otherName={student.name}
        emptyText="Nog geen berichten in dit gesprek."
        closedText=""
      />
    </div>
  );
}
