import Link from "next/link";
import { getStore } from "@/lib/data";
import { listSubmissions, unseenFeedback } from "@/lib/data/assignments";
import { assignmentsOf, assignmentTitle } from "@/lib/domain/assignment";

/**
 * On the dashboard and "Mijn opleiding": new feedback from Sabine (not opened
 * yet) and final assignments for which she asked for an improved version.
 * Renders nothing when there is neither.
 */
export async function NewFeedbackNotice({ userId }: { userId: string }) {
  const [unseen, submissions] = await Promise.all([unseenFeedback(userId), listSubmissions({ userId })]);
  const improve = submissions.filter((s) => s.status === "verbetering_nodig");
  if (unseen.length === 0 && improve.length === 0) return null;
  const lessons = await getStore().listLessons();
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const label = (lessonId: string, blockId: string) => {
    const lesson = byId.get(lessonId);
    const a = lesson ? assignmentsOf(lesson.blocks).find((b) => b.id === blockId) : undefined;
    return `${a ? assignmentTitle(a) : "Opdracht"}${lesson ? ` (${lesson.title})` : ""}`;
  };
  const items = new Map<string, { href: string; text: string; improve: boolean }>();
  for (const s of improve) items.set(s.id, { href: `/les/${s.lessonId}#opdracht-${s.blockId}`, text: label(s.lessonId, s.blockId), improve: true });
  for (const f of unseen) {
    if (!items.has(f.submissionId)) items.set(f.submissionId, { href: `/les/${f.lessonId}#opdracht-${f.blockId}`, text: label(f.lessonId, f.blockId), improve: false });
  }
  return (
    <section aria-labelledby="nieuwe-feedback" className="rounded-xl border border-gold/50 bg-gold-soft/50 p-5">
      <h2 id="nieuwe-feedback" className="font-sans text-lg font-semibold">
        {unseen.length > 0 ? "Je hebt nieuwe feedback van Sabine" : "Sabine vraagt om een aangepaste versie"}
      </h2>
      <ul className="mt-2 space-y-1.5 text-[15px]">
        {[...items.values()].map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-bordeaux underline">{item.text}</Link>
            {item.improve && <span className="ml-2 text-sm text-bordeaux">· verbetering nodig: lever een aangepaste versie in</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
