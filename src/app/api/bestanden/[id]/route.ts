import { currentSession } from "@/lib/auth/session";
import { getFiles, getStore } from "@/lib/data";
import { hasLessonAccess } from "@/lib/domain/access";
import { fileAccess } from "@/lib/domain/privacy";
import { lessonFileIds, visibleCourse } from "@/lib/domain/visibility";

/** Serves uploads after checking that the viewer may see them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return new Response("Niet ingelogd", { status: 401 });
  // A linked authenticator app that has not given its code yet counts as not signed in.
  if (session.needsCode) return new Response("Tweestapsverificatie nodig", { status: 401 });
  const { user } = session;

  const file = await getFiles().read((await params).id);
  if (!file) return new Response("Niet gevonden", { status: 404 });

  const { meta } = file;
  // Owner: everything; a student: own files only (src/lib/domain/privacy.ts), course material below.
  const decision = fileAccess(user, meta.belongsTo);
  let allowed = decision === "allow";
  if (decision === "course") {
    // Course material: only for students whose access is active, and only when a lesson they
    // can see uses it. A file in a concept, a hidden module or a module of the other package
    // stays closed, also through a direct link.
    const store = getStore();
    const enrollment = await store.getEnrollmentForUser(user.id);
    if (hasLessonAccess(enrollment)) {
      const [modules, lessons] = await Promise.all([store.listModules(), store.listLessons()]);
      const id = meta.id.toLowerCase();
      allowed = visibleCourse(modules, lessons, enrollment).lessons.some((l) => lessonFileIds(l).has(id));
    }
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
