import "server-only";
import { randomBytes } from "crypto";
import { studentOverview, type StudentOverview } from "@/lib/academy";
import { pushTo } from "@/lib/community/push";
import { getStore, type Assessment, type Enrollment, type User } from "@/lib/data";
import { assignmentsOf, assignmentTitle } from "@/lib/domain/assignment";
import { certificateCode, onlineCertificateReadiness, practicalCertificateReadiness } from "@/lib/domain/feedback";
import { appUrl, sendMail } from "@/lib/ws/mail";

/**
 * Feedback and certificates on the server: the notice to a student when
 * feedback is sent, and what still stands between a student and a
 * certificate. Used by the admin actions and the MCP tools.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Tells the student that feedback is there: a mail (in the mail history as
 * "Academy feedback") and a push notification where the student allowed it.
 * The badge in the Academy menu comes from the unseen feedback itself.
 * Never throws: the feedback has been saved already.
 */
export async function notifyFeedbackSent(input: { studentId: string; lessonId: string; blockId: string; assessed: Assessment | null; sentBy: string }) {
  try {
    const store = getStore();
    const [student, lesson] = await Promise.all([store.getUser(input.studentId), store.getLesson(input.lessonId)]);
    if (!student) return;
    const assignment = lesson ? assignmentsOf(lesson.blocks).find((a) => a.id === input.blockId) : undefined;
    const what = `${assignment ? `"${assignmentTitle(assignment)}"` : "je opdracht"}${lesson ? ` in de les "${lesson.title}"` : ""}`;
    const path = lesson ? `/les/${lesson.id}#opdracht-${input.blockId}` : "/opleiding";
    const extra =
      input.assessed === "verbetering_nodig"
        ? "Sabine vraagt je om een aangepaste versie in te leveren. Pas je antwoorden aan en dien de opdracht opnieuw in."
        : input.assessed === "voldoende"
          ? "Je opdracht is beoordeeld als voldoende."
          : "";
    await Promise.all([
      sendMail({
        to: student.email,
        subject: input.assessed === "verbetering_nodig" ? "Feedback op je opdracht: aangepaste versie gevraagd" : "Je hebt feedback van Sabine",
        text: [
          `Hoi ${firstName(student.name)},`,
          `Sabine heeft persoonlijke feedback gegeven op ${what}.`,
          extra,
          `Lees de feedback hier: ${appUrl()}${path}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        log: { kind: "academy_feedback", sentBy: input.sentBy },
      }),
      pushTo([student.id], { title: "Feedback van Sabine", body: `Er is feedback op ${what}.`, url: path, tag: `feedback-${input.blockId}` }),
    ]);
  } catch (err) {
    console.error(`[feedback] melding aan cursist mislukt: ${(err as Error).message}`);
  }
}

/** What still stands between the student and the online certificate (Academy 15). */
export function onlineCertificateCheck(o: StudentOverview) {
  const status = new Map(o.submissions.map((s) => [`${s.lessonId}:${s.blockId}`, s.status]));
  const graded = o.progress.flatMap((p) =>
    p.lessons.flatMap((l) =>
      assignmentsOf(l.blocks)
        .filter((a) => a.graded)
        .map((a) => ({ title: assignmentTitle(a), lesson: l.title, status: status.get(`${l.id}:${a.id}`) ?? null })),
    ),
  );
  return onlineCertificateReadiness({
    modules: o.progress.map((p) => ({ title: p.module.title, lessonsTotal: p.lessons.length, lessonsCompleted: p.completedCount })),
    graded,
    onlineConfirmed: Boolean(o.enrollment?.onlineCompletedAt),
  });
}

export type CertificateChange =
  | { ok: true; patch: Partial<Enrollment>; log: string }
  | { ok: false; error: string };

/**
 * The enrollment patch to release or withdraw a certificate, after checking
 * the conditions. Releasing stays a deliberate step of the owner.
 */
export async function certificateChange(
  user: User,
  enrollment: Enrollment,
  op: "releaseCertificate" | "withdrawCertificate" | "releasePractical" | "withdrawPractical",
): Promise<CertificateChange> {
  const now = new Date().toISOString();
  const random = () => randomBytes(3).toString("hex");
  switch (op) {
    case "releaseCertificate": {
      const check = onlineCertificateCheck(await studentOverview(user));
      if (!check.ready) return { ok: false, error: `Het certificaat kan nog niet worden vrijgegeven. Nog open: ${check.missing.join(" ")}` };
      return {
        ok: true,
        patch: { certificateReleasedAt: now, certificateCode: enrollment.certificateCode ?? certificateCode("online", new Date().getFullYear(), random()) },
        log: "Online certificaat vrijgegeven",
      };
    }
    case "withdrawCertificate":
      return { ok: true, patch: { certificateReleasedAt: null }, log: "Certificaat ingetrokken" };
    case "releasePractical": {
      const check = practicalCertificateReadiness(enrollment);
      if (!check.ready) return { ok: false, error: `Het praktijkcertificaat kan nog niet worden vrijgegeven. ${check.missing.join(" ")}` };
      return {
        ok: true,
        patch: {
          practicalCertificateReleasedAt: now,
          practicalCertificateCode: enrollment.practicalCertificateCode ?? certificateCode("praktijk", new Date().getFullYear(), random()),
        },
        log: "Praktijkcertificaat vrijgegeven",
      };
    }
    case "withdrawPractical":
      return { ok: true, patch: { practicalCertificateReleasedAt: null }, log: "Praktijkcertificaat ingetrokken" };
  }
}
