import { currentSession } from "@/lib/auth/session";
import { getFiles, getStore } from "@/lib/data";
import { isUuid } from "@/lib/db";
import { canUseCommunity } from "@/lib/community/rules";
import { viewerFor } from "@/lib/community/server";

/**
 * The profile photo next to messages in the community and the private chat (feedback Sabine).
 * Sabine sees every photo. A student sees her own, Sabine's (also in the private chat when
 * the community is closed) and, with access to the community, those of the other students.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await currentSession();
  if (!session || session.needsCode) return new Response("Niet ingelogd", { status: 401 });
  const { userId } = await params;
  if (!isUuid(userId)) return new Response("Niet gevonden", { status: 404 });
  const store = getStore();
  const [target, viewer] = await Promise.all([store.getUser(userId), viewerFor(session.user)]);
  if (!target || (target.role !== "student" && target.role !== "owner")) return new Response("Niet gevonden", { status: 404 });
  const allowed =
    viewer.role === "owner" ||
    (viewer.role === "student" && (target.id === viewer.id || target.role === "owner" || canUseCommunity(viewer)));
  if (!allowed) return new Response("Geen toegang", { status: 403 });

  const photoId = (await store.getProfile(userId))?.photoFileId;
  const file = photoId ? await getFiles().read(photoId) : null;
  if (!file || !/^image\/(jpeg|png|webp|gif)$/.test(file.meta.mime)) return new Response("Niet gevonden", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.meta.mime,
      "Content-Length": String(file.data.length),
      // The address carries the photo id, so a new photo is a new address.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
