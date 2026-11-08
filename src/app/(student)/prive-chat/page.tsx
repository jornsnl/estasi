import { Conversation } from "@/components/community/Conversation";
import { Notice } from "@/components/Notice";
import { canReadConversation, canWriteConversation } from "@/lib/community/rules";
import { listMessages, markConversationRead, requireViewer } from "@/lib/community/server";

export const metadata = { title: "Privéchat" };

type Search = Record<string, string | string[] | undefined>;

export default async function PrivateChatPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireViewer();
  const allowed = canReadConversation(viewer, viewer.id);
  const messages = allowed ? await listMessages(viewer, viewer.id) : [];
  if (allowed) await markConversationRead(viewer, viewer.id);
  const canWrite = canWriteConversation(viewer, viewer.id, messages.length > 0);

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Privéchat</p>
      <h1 className="mt-1 mb-2 text-4xl">Berichten met Sabine</h1>
      <p className="mb-6 text-muted">Een persoonlijk gesprek tussen jou en Sabine. Andere cursisten zien dit nooit.</p>
      <Notice searchParams={searchParams} />
      {allowed ? (
        <Conversation
          viewerId={viewer.id}
          studentId={viewer.id}
          messages={messages}
          canWrite={canWrite}
          otherName="Sabine"
          emptyText="Nog geen berichten. Stel hier je vraag aan Sabine."
          closedText="Je toegang is op dit moment niet actief. Je kunt deze berichten lezen en Sabine antwoorden zodra zij je een bericht stuurt."
        />
      ) : (
        <div className="card p-6 text-muted">Er is nog geen opleiding aan je account gekoppeld.</div>
      )}
    </div>
  );
}
