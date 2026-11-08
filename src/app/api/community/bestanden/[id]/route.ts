import { currentSession } from "@/lib/auth/session";
import { getFiles } from "@/lib/data";
import { canSeeAttachment, opensInline } from "@/lib/community/rules";
import { attachmentWithParent, viewerFor } from "@/lib/community/server";

/**
 * The only way for others to open an image, video or file of the community or
 * of a private message: first the same check as the post, comment or
 * conversation it belongs to (src/lib/community/rules.ts, canSeeAttachment).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session || session.needsCode) return new Response("Niet ingelogd", { status: 401 });
  if (session.user.role === "couple") return new Response("Geen toegang", { status: 403 });

  const attachment = await attachmentWithParent((await params).id);
  if (!attachment) return new Response("Niet gevonden", { status: 404 });
  const viewer = await viewerFor(session.user);
  if (!canSeeAttachment(viewer, attachment.parent)) return new Response("Geen toegang", { status: 403 });

  const file = await getFiles().read(attachment.fileId);
  if (!file) return new Response("Niet gevonden", { status: 404 });
  const inline = opensInline(attachment.mime);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? attachment.mime : "application/octet-stream",
      "Content-Length": String(file.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
