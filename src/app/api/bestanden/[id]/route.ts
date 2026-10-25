import { currentUser } from "@/lib/auth/session";
import { getFiles, getStore } from "@/lib/data";
import { hasLessonAccess } from "@/lib/domain/access";

/** Serves uploads after checking that the viewer may see them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Niet ingelogd", { status: 401 });

  const file = await getFiles().read((await params).id);
  if (!file) return new Response("Niet gevonden", { status: 404 });

  const { meta } = file;
  let allowed = user.role === "owner" || meta.belongsTo === user.id;
  if (!allowed && meta.belongsTo === null) {
    // Course material: only for students whose access is active.
    allowed = hasLessonAccess(await getStore().getEnrollmentForUser(user.id));
  }
  if (!allowed) return new Response("Geen toegang", { status: 403 });

  const inline = /^(image\/|application\/pdf)/.test(meta.mime);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Length": String(meta.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
