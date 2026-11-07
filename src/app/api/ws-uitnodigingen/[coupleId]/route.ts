import { currentUser } from "@/lib/auth/session";
import { coupleIdOf } from "@/lib/ws/access";
import { isUuid, one } from "@/lib/ws/db";
import { invitationsFor, invitationsWorkbook } from "@/lib/ws/invitations";
import { groupsOf } from "@/lib/ws/rsvp";

/** The invitation list as an Excel file; addresses only for Sabine and the couple itself. */
export async function GET(_req: Request, { params }: { params: Promise<{ coupleId: string }> }) {
  const account = await currentUser();
  const { coupleId } = await params;
  if (!account || !isUuid(coupleId)) return new Response("Niet ingelogd", { status: 401 });
  if (account.role !== "owner" && (await coupleIdOf(account.id)) !== coupleId) return new Response("Niet gevonden", { status: 404 });
  const couple = await one<{ partner1_first: string; partner2_first: string }>("select partner1_first, partner2_first from couples where id = $1", [coupleId]);
  if (!couple) return new Response("Niet gevonden", { status: 404 });
  const groups = new Map((await groupsOf(coupleId)).map((g) => [g.id, g.name]));
  const data = await invitationsWorkbook(await invitationsFor(coupleId), groups);
  const name = `Uitnodigingslijst ${couple.partner1_first}${couple.partner2_first ? ` & ${couple.partner2_first}` : ""}.xlsx`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
