import "server-only";
import { audit, studentOverview } from "@/lib/academy";
import { certificateChange, notifyFeedbackSent, onlineCertificateCheck } from "@/lib/academy-feedback";
import { getStore, type AssignmentAnswers, type AssignmentBlock, type Block, type Enrollment, type User } from "@/lib/data";
import {
  getSubmissionById,
  getVersion,
  listAssignmentFeedback,
  listFeedbackRequests,
  listSubmissions,
  listVersions,
  saveFeedback,
  setFeedbackStatus,
} from "@/lib/data/assignments";
import { ASSESSMENT_LABELS, FEEDBACK_STATUS_LABELS, matchesRequest, practicalCertificateReadiness } from "@/lib/domain/feedback";
import { query } from "@/lib/db";
import { ACCESS_LABELS, accessStatus, addMonths, pause, resume } from "@/lib/domain/access";
import { LIMITS } from "@/lib/domain/input";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { answersAsText, assignmentsOf, assignmentTitle, STATUS_LABELS } from "@/lib/domain/assignment";
import { COURSE_STATUS_LABELS } from "@/lib/domain/progress";
import { formatDate, fromDateInput } from "@/lib/util/format";
import { defineTool, ToolError, z } from "../tool";

/** MCP tools for the Future Weddings Academy (students, progress, feedback, content). */

const id = z.string().min(1).max(100);

async function student(studentId: string): Promise<User> {
  const store = getStore();
  const user = (await store.getUser(studentId)) ?? (studentId.includes("@") ? await store.getUserByEmail(studentId) : null);
  if (!user || user.role !== "student") throw new ToolError("Cursist niet gevonden. Gebruik academy_list_students voor de ids.");
  return user;
}

async function enrollmentOf(user: User): Promise<Enrollment> {
  const enrollment = await getStore().getEnrollmentForUser(user.id);
  if (!enrollment) throw new ToolError(`${user.name} heeft geen inschrijving.`);
  return enrollment;
}

function summary(o: Awaited<ReturnType<typeof studentOverview>>) {
  return {
    id: o.user.id,
    name: o.user.name,
    email: o.user.email,
    package: o.enrollment ? `${o.enrollment.package} (${PACKAGE_LABELS[o.enrollment.package]})` : null,
    purchasedAt: o.enrollment?.purchasedAt ?? null,
    access: o.access === "none" ? "geen" : ACCESS_LABELS[o.access],
    accessCode: o.access,
    accessEndsAt: o.enrollment?.endsAt ?? null,
    progressPercent: o.percent,
    status: o.status ? COURSE_STATUS_LABELS[o.status] : null,
    statusCode: o.status,
    openFeedback: o.openFeedback,
    completedModules: o.completedModules,
    modulesInPackage: o.progress.length,
    submittedAssignments: o.submittedAssignments,
    activated: Boolean(o.user.activatedAt),
    lastActiveAt: o.user.lastActiveAt,
  };
}

const assignmentSummary = (a: AssignmentBlock) => ({
  id: a.id,
  type: a.type,
  title: a.title,
  intro: a.intro,
  requiredForLesson: a.requiredForLesson,
  feedbackAllowed: a.feedbackAllowed,
  graded: a.graded,
  repeatOf: a.repeatOf,
  parts: a.parts.map((p) => ({
    title: p.title,
    intro: p.intro,
    fields: p.fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      help: f.help,
      required: f.required,
      ...("options" in f ? { options: f.options, allowComment: f.allowComment } : {}),
      ...("min" in f ? { min: f.min, max: f.max, minLabel: f.minLabel, maxLabel: f.maxLabel, explanation: f.explanation } : {}),
      ...("rows" in f ? { rows: f.rows.map((r) => r.label), mode: f.mode } : {}),
      ...("accept" in f ? { accept: f.accept, maxFiles: f.maxFiles } : {}),
    })),
  })),
});

const blockSummary = (b: Block) => {
  switch (b.type) {
    case "heading":
      return { id: b.id, type: b.type, style: b.style, text: b.text };
    case "goals":
      return { id: b.id, type: b.type, title: b.title, items: b.items };
    case "video":
      return { id: b.id, type: b.type, url: b.url, caption: b.caption };
    case "text":
      return b.html ? { id: b.id, type: b.type, html: b.html } : { id: b.id, type: b.type, markdown: b.markdown };
    case "image":
      return { id: b.id, type: b.type, file: b.file?.name ?? null, alt: b.alt, caption: b.caption };
    case "download":
      return { id: b.id, type: b.type, label: b.label, description: b.description, url: b.url, file: b.file?.name ?? null };
    case "assignment":
      return assignmentSummary(b);
    default:
      return { id: (b as Block).id, type: (b as Block).type };
  }
};

/** Answers per field as text, with the question as it was in that version. */
const readable = (assignment: AssignmentBlock, answers: AssignmentAnswers) =>
  answersAsText(assignment, answers).map((l) => ({ part: l.part || undefined, question: l.question, required: l.required, answer: l.answer }));

/** Finds a version by its id, or (old links) by the answer id it was converted from. */
async function versionFor(id: string) {
  const direct = await getVersion(id);
  if (direct) return direct;
  const row = await query<{ id: string }>(
    `select v.id from public.submission_versions v join public.assignment_submissions s on s.id = v.submission_id
      where s.legacy_answer_id::text = $1 or s.id::text = $1 order by v.version desc limit 1`,
    [id],
  );
  return row[0] ? getVersion(row[0].id) : null;
}

export const academyTools = [
  defineTool({
    name: "academy_overview",
    title: "Academy: overzicht",
    description: "Kerncijfers van de Future Weddings Academy: actieve cursisten, wie wacht op bevestiging van de online afronding, openstaande feedback en verlopen of gepauzeerde toegang. Begin hier voor een dagelijkse stand van zaken.",
    scope: "read",
    input: z.object({}),
    async run() {
      const overviews = await Promise.all((await getStore().listUsers("student")).map(studentOverview));
      const count = (fn: (o: (typeof overviews)[number]) => boolean) => overviews.filter(fn).length;
      return {
        students: overviews.length,
        active: count((o) => o.access === "active"),
        paused: count((o) => o.access === "paused"),
        expired: count((o) => o.access === "expired"),
        revoked: count((o) => o.access === "revoked"),
        notActivated: count((o) => !o.user.activatedAt),
        awaitingConfirmation: overviews.filter((o) => o.status === "awaiting_confirmation").map(summary),
        openFeedbackTotal: overviews.reduce((n, o) => n + o.openFeedback, 0),
        studentsWithOpenFeedback: overviews.filter((o) => o.openFeedback > 0).map((o) => ({ id: o.user.id, name: o.user.name, openFeedback: o.openFeedback })),
        accessEndingWithin30Days: overviews
          .filter((o) => o.access === "active" && o.enrollment && new Date(o.enrollment.endsAt).getTime() - Date.now() < 30 * 86_400_000)
          .map((o) => ({ id: o.user.id, name: o.user.name, endsAt: o.enrollment!.endsAt })),
      };
    },
  }),

  defineTool({
    name: "academy_list_students",
    title: "Academy: cursisten",
    description: "Lijst van cursisten met pakket, toegang (actief, gepauzeerd, verlopen, ingetrokken), einddatum, voortgang in procenten, status, openstaande feedback en laatste activiteit. Filter op toegang of zoek op naam, e-mail of bedrijf.",
    scope: "read",
    input: z.object({
      search: z.string().max(100).optional().describe("Deel van naam, e-mailadres of bedrijfsnaam"),
      access: z.enum(["active", "paused", "expired", "revoked", "none"]).optional().describe("Alleen cursisten met deze toegang"),
    }),
    async run({ search, access }) {
      const store = getStore();
      const users = await store.listUsers("student");
      const needle = search?.trim().toLowerCase();
      const profiles = needle ? await Promise.all(users.map((u) => store.getProfile(u.id))) : [];
      const matching = users.filter((u, i) => !needle || `${u.name} ${u.email} ${profiles[i]?.companyName ?? ""}`.toLowerCase().includes(needle));
      const overviews = await Promise.all(matching.map(studentOverview));
      return overviews.filter((o) => !access || o.access === access).map(summary);
    },
  }),

  defineTool({
    name: "academy_get_student",
    title: "Academy: cursist",
    description: "Alles over één cursist: gegevens en profiel, inschrijving (pakket, aankoopdatum, einddatum, pauzes, intrekking, online afronding, certificaat, praktijkstatus, interne notities), voortgang per module en les, en de laatste regels uit het logboek.",
    scope: "read",
    input: z.object({ studentId: id.describe("Id of e-mailadres van de cursist") }),
    async run({ studentId }) {
      const user = await student(studentId);
      const store = getStore();
      const [overview, profile, log] = await Promise.all([studentOverview(user), store.getProfile(user.id), store.listAudit(user.id)]);
      return {
        ...summary(overview),
        profile: profile && {
          phone: profile.phone,
          city: profile.city,
          companyName: profile.companyName,
          instagram: profile.instagram,
          website: profile.website,
          intro: profile.intro,
          goals: profile.goals,
        },
        enrollment: overview.enrollment && {
          id: overview.enrollment.id,
          pausedAt: overview.enrollment.pausedAt,
          pauses: overview.enrollment.pauses,
          revokedAt: overview.enrollment.revokedAt,
          onlineCompletedAt: overview.enrollment.onlineCompletedAt,
          certificateReleasedAt: overview.enrollment.certificateReleasedAt,
          certificateCode: overview.enrollment.certificateCode,
          practicalStatus: overview.enrollment.practicalStatus,
          practicalCertificateReleasedAt: overview.enrollment.practicalCertificateReleasedAt,
          practicalCertificateCode: overview.enrollment.practicalCertificateCode,
          ownerNotes: overview.enrollment.ownerNotes,
          // What still stands between the student and each certificate (released by hand).
          onlineCertificateMissing: onlineCertificateCheck(overview).missing,
          practicalCertificateMissing: practicalCertificateReadiness(overview.enrollment).missing,
        },
        modules: overview.progress.map((p) => ({
          title: p.module.title,
          state: p.state,
          unlockedManually: p.unlockedManually,
          assignmentsSubmitted: p.assignments.submitted,
          assignmentsTotal: p.assignments.total,
          lessons: p.lessons.map((l) => ({ id: l.id, title: l.title, completed: p.completedLessonIds.has(l.id) })),
        })),
        recentLog: log.slice(0, 15).map((e) => ({ at: e.at, action: e.action, details: e.details })),
      };
    },
  }),

  defineTool({
    name: "academy_list_open_feedback",
    title: "Academy: feedbackverzoeken",
    description: "Feedbackverzoeken van cursisten en ingeleverde eindopdrachten die op een beoordeling wachten. Standaard de openstaande (status nieuw of in behandeling, oudste eerst); met status ook nieuw, in_behandeling, afgerond of alle. Met de opdracht, alle antwoorden, de eventuele vraag aan Sabine, of er al een concept klaarstaat, en het versionId voor academy_give_feedback.",
    scope: "read",
    input: z.object({
      studentId: id.optional().describe("Alleen voor deze cursist"),
      status: z.enum(["open", "nieuw", "in_behandeling", "afgerond", "alle"]).default("open"),
      moduleId: id.optional().describe("Alleen voor deze module"),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    async run({ studentId, status, moduleId, limit }) {
      const only = studentId ? await student(studentId) : null;
      const [requests, feedback] = await Promise.all([
        listFeedbackRequests(only ? { userId: only.id } : {}),
        listAssignmentFeedback(only ? { userId: only.id } : {}),
      ]);
      return requests
        .filter((r) => matchesRequest(r, { status, moduleId }))
        .sort((x, y) => x.submittedAt.localeCompare(y.submittedAt))
        .slice(0, limit)
        .map((r) => {
          const concept = feedback.find((f) => f.versionId === r.versionId && !f.sentAt);
          return {
            versionId: r.versionId,
            version: r.version,
            student: { id: r.userId, name: r.studentName },
            module: r.moduleTitle,
            lesson: { id: r.lessonId, title: r.lessonTitle ?? "(les verwijderd)" },
            assignment: assignmentTitle(r.assignment),
            finalAssignment: r.assignment.graded,
            assignmentStatus: STATUS_LABELS[r.submissionStatus],
            feedbackRequested: r.feedbackRequested,
            questionForSabine: r.questionForSabine || null,
            answers: readable(r.assignment, r.answers),
            files: answersAsText(r.assignment, r.answers).flatMap((l) => l.files.map((f) => f.name)),
            status: FEEDBACK_STATUS_LABELS[r.feedbackStatus].toLowerCase(),
            statusCode: r.feedbackStatus,
            submittedAt: r.submittedAt,
            concept: concept ? { text: concept.text, assessment: concept.assessment, updatedAt: concept.updatedAt } : null,
            previousFeedback: feedback.filter((f) => f.submissionId === r.submissionId && f.sentAt).map((f) => ({ at: f.sentAt, text: f.text })),
          };
        });
    },
  }),

  defineTool({
    name: "academy_get_answers",
    title: "Academy: antwoorden van een cursist",
    description: "Alle opdrachten van een cursist, per les: status (concept, ingediend, verbetering nodig, voldoende), het huidige concept, elke ingediende versie met de antwoorden en de gegeven feedback. Optioneel voor één les.",
    scope: "read",
    input: z.object({ studentId: id.describe("Id of e-mailadres van de cursist"), lessonId: id.optional() }),
    async run({ studentId, lessonId }) {
      const user = await student(studentId);
      const store = getStore();
      const [lessons, submissions, versions, feedback] = await Promise.all([
        store.listLessons(),
        listSubmissions({ userId: user.id, lessonId }),
        listVersions({ userId: user.id }),
        listAssignmentFeedback({ userId: user.id }),
      ]);
      const byId = new Map(lessons.map((l) => [l.id, l]));
      return submissions.map((s) => {
        const lesson = byId.get(s.lessonId);
        const current = lesson ? assignmentsOf(lesson.blocks).find((a) => a.id === s.blockId) : undefined;
        const mine = versions.filter((v) => v.submissionId === s.id).sort((a, b) => a.version - b.version);
        const definition = current ?? mine.at(-1)?.assignment;
        return {
          submissionId: s.id,
          lesson: lesson?.title ?? "(les verwijderd)",
          lessonId: s.lessonId,
          assignment: definition ? assignmentTitle(definition) : "(opdracht niet meer in de les)",
          status: STATUS_LABELS[s.status],
          feedbackRequested: s.feedbackRequested,
          draft: definition ? readable(definition, s.draft) : s.draft,
          draftUpdatedAt: s.updatedAt,
          versions: mine.map((v) => ({
            versionId: v.id,
            version: v.version,
            submittedAt: v.submittedAt,
            feedbackStatus: v.feedbackStatus,
            questionForSabine: v.questionForSabine || null,
            answers: readable(v.assignment, v.answers),
            feedback: feedback.filter((f) => f.versionId === v.id).map((f) => ({ at: f.sentAt ?? f.createdAt, text: f.text, sent: Boolean(f.sentAt) })),
          })),
        };
      });
    },
  }),

  defineTool({
    name: "academy_list_content",
    title: "Academy: lesinhoud",
    description: "De opbouw van de opleiding: modules op volgorde met hun lessen (id, titel, samenvatting, aantal opdrachten en opdrachten waarop feedback gevraagd kan worden).",
    scope: "read",
    input: z.object({}),
    async run() {
      const store = getStore();
      const [modules, lessons] = await Promise.all([store.listModules(), store.listLessons()]);
      return modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        lessons: lessons
          .filter((l) => l.moduleId === m.id)
          .map((l) => ({
            id: l.id,
            title: l.title,
            summary: l.summary,
            assignments: assignmentsOf(l.blocks).length,
            feedbackAssignments: assignmentsOf(l.blocks).filter((a) => a.feedbackAllowed).length,
          })),
      }));
    },
  }),

  defineTool({
    name: "academy_get_lesson",
    title: "Academy: les",
    description: "Eén les met alle blokken: video's, tekst (html of markdown), afbeeldingen, downloads en opdrachten met hun onderdelen en velden (kort of lang antwoord, meerkeuze, schaal, schaal per onderwerp, upload), inclusief wat verplicht is en of de cursist feedback mag vragen.",
    scope: "read",
    input: z.object({ lessonId: id }),
    async run({ lessonId }) {
      const store = getStore();
      const lesson = await store.getLesson(lessonId);
      if (!lesson) throw new ToolError("Les niet gevonden. Gebruik academy_list_content.");
      const parent = await store.getModule(lesson.moduleId);
      return { id: lesson.id, module: parent?.title ?? null, title: lesson.title, summary: lesson.summary, blocks: lesson.blocks.map(blockSummary) };
    },
  }),

  defineTool({
    name: "academy_audit_log",
    title: "Academy: logboek",
    description: "Het logboek van beheeracties (nieuwste eerst), voor alle cursisten of voor één cursist.",
    scope: "read",
    input: z.object({ studentId: id.optional(), limit: z.number().int().min(1).max(200).default(50) }),
    async run({ studentId, limit }) {
      const store = getStore();
      const target = studentId ? await student(studentId) : null;
      const [entries, users] = await Promise.all([store.listAudit(target?.id), store.listUsers()]);
      const names = new Map(users.map((u) => [u.id, u.name]));
      return entries.slice(0, limit).map((e) => ({
        at: e.at,
        by: names.get(e.actorId) ?? e.actorId,
        student: e.targetUserId ? (names.get(e.targetUserId) ?? e.targetUserId) : null,
        action: e.action,
        details: e.details,
      }));
    },
  }),

  defineTool({
    name: "academy_get_settings",
    title: "Academy: instellingen",
    description: "Instellingen van de Academy: welkomstvideo en tekst, contactadres, praktijkplekken en de privacyuitleg boven de opdrachten.",
    scope: "read",
    input: z.object({}),
    run: async () => getStore().getSettings(),
  }),

  // Writes ---------------------------------------------------------------------------------

  defineTool({
    name: "academy_give_feedback",
    title: "Academy: feedback geven",
    description: "Schrijft feedback op een ingediende versie van een opdracht (versionId uit academy_list_open_feedback of academy_get_answers). Met send=false (standaard) wordt het een concept dat alleen de opleider ziet (status in behandeling); een bestaand concept wordt bijgewerkt. Met send=true gaat het naar de cursist (mail, pushmelding en melding in de Academy) en wordt het verzoek afgerond. Bij een eindopdracht kan assessment (voldoende of verbetering_nodig) mee; die geldt zodra de feedback verstuurd is. Laat de gebruiker de tekst goedkeuren voor je verstuurt.",
    scope: "write",
    input: z.object({
      versionId: id.optional().describe("Versie van de opdracht"),
      answerId: id.optional().describe("Verouderd: id van een oud antwoord of van een opdracht; de laatste versie krijgt de feedback"),
      text: z.string().trim().max(LIMITS.feedback).default(""),
      send: z.boolean().default(false).describe("true: versturen naar de cursist; false: als concept bewaren"),
      assessment: z.enum(["voldoende", "verbetering_nodig"]).optional().describe("Alleen bij een eindopdracht"),
    }),
    async run({ versionId, answerId, text, send, assessment }, ctx) {
      const target = versionId ?? answerId;
      if (!target) throw new ToolError("Geef versionId.");
      const version = await versionFor(target);
      if (!version) throw new ToolError("Ingediende versie niet gevonden. Een concept kan nog geen feedback krijgen.");
      const result = await saveFeedback({ version, authorId: ctx.user.id, text, assessment: assessment ?? null, send });
      if (!result.ok) throw new ToolError(result.error);
      if (!send) {
        await audit(ctx.user, "Feedback als concept bewaard", `versie ${version.version} via ${ctx.clientName}`, version.userId);
        return "Concept bewaard. De cursist ziet het pas na versturen (send=true of in het feedbackscherm in het beheer).";
      }
      const submission = await getSubmissionById(version.submissionId);
      if (submission) {
        await notifyFeedbackSent({ studentId: version.userId, lessonId: submission.lessonId, blockId: submission.blockId, assessed: result.assessed, sentBy: ctx.user.name });
      }
      await audit(
        ctx.user,
        "Feedback verstuurd",
        `versie ${version.version}${result.assessed ? ` · beoordeling: ${ASSESSMENT_LABELS[result.assessed]}` : ""} via ${ctx.clientName}`,
        version.userId,
      );
      return `Feedback verstuurd${result.assessed ? ` met beoordeling "${ASSESSMENT_LABELS[result.assessed]}"` : ""}. De cursist krijgt er een melding van.`;
    },
  }),

  defineTool({
    name: "academy_set_feedback_status",
    title: "Academy: status feedbackverzoek",
    description: "Zet de status van een feedbackverzoek (versionId) op nieuw, in_behandeling of afgerond, bijvoorbeeld afgerond als de feedback buiten het platform is gegeven.",
    scope: "write",
    input: z.object({ versionId: id, status: z.enum(["nieuw", "in_behandeling", "afgerond"]) }),
    async run({ versionId, status }, ctx) {
      const version = await getVersion(versionId);
      if (!version) throw new ToolError("Versie niet gevonden.");
      if (!(await setFeedbackStatus(version.id, status))) throw new ToolError("Bij deze versie is geen feedback gevraagd en het is geen eindopdracht.");
      await audit(ctx.user, "Status feedbackverzoek gewijzigd", `versie ${version.version}: ${FEEDBACK_STATUS_LABELS[status].toLowerCase()} via ${ctx.clientName}`, version.userId);
      return `Status: ${FEEDBACK_STATUS_LABELS[status].toLowerCase()}.`;
    },
  }),

  defineTool({
    name: "academy_update_notes",
    title: "Academy: interne notities",
    description: "Vervangt de interne notities bij een cursist (alleen zichtbaar voor de opleider). Lees eerst de huidige notities met academy_get_student en voeg toe in plaats van te overschrijven.",
    scope: "write",
    input: z.object({ studentId: id, notes: z.string().max(LIMITS.ownerNotes) }),
    async run({ studentId, notes }, ctx) {
      const user = await student(studentId);
      const enrollment = await enrollmentOf(user);
      await getStore().updateEnrollment(enrollment.id, { ownerNotes: notes });
      await audit(ctx.user, "Notities bijgewerkt", `via ${ctx.clientName}`, user.id);
      return `Notities van ${user.name} opgeslagen.`;
    },
  }),

  defineTool({
    name: "academy_change_access",
    title: "Academy: toegang aanpassen",
    description: "Past de toegang van een cursist aan: extend (verlengen met months maanden, bij verlopen toegang vanaf vandaag), set_end (einddatum endDate, JJJJ-MM-DD), pause, resume (einddatum schuift mee), revoke (intrekken) of restore (intrekking ongedaan maken).",
    scope: "write",
    destructive: true,
    input: z.object({
      studentId: id,
      action: z.enum(["extend", "set_end", "pause", "resume", "revoke", "restore"]),
      months: z.number().int().min(1).max(24).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    async run({ studentId, action, months, endDate }, ctx) {
      const user = await student(studentId);
      const enrollment = await enrollmentOf(user);
      let patch: Partial<Enrollment>;
      let log: string;
      switch (action) {
        case "extend": {
          const m = months ?? 1;
          const base = accessStatus(enrollment) === "expired" ? new Date().toISOString() : enrollment.endsAt;
          patch = { endsAt: addMonths(base, m) };
          log = `Toegang verlengd met ${plural(m, "maand", "maanden")} tot ${formatDate(patch.endsAt)}`;
          break;
        }
        case "set_end": {
          const endsAt = endDate ? fromDateInput(endDate, "23:59") : null;
          if (!endsAt) throw new ToolError("Geef endDate als JJJJ-MM-DD.");
          patch = { endsAt };
          log = `Einddatum gewijzigd van ${formatDate(enrollment.endsAt)} naar ${formatDate(endsAt)}`;
          break;
        }
        case "pause":
          if (enrollment.pausedAt) throw new ToolError("De toegang staat al op pauze.");
          patch = pause(enrollment);
          log = "Toegang gepauzeerd";
          break;
        case "resume":
          if (!enrollment.pausedAt) throw new ToolError("De toegang staat niet op pauze.");
          patch = resume(enrollment);
          log = `Toegang hervat, nieuwe einddatum ${formatDate(patch.endsAt)}`;
          break;
        case "revoke":
          patch = { revokedAt: new Date().toISOString() };
          log = "Toegang ingetrokken";
          break;
        case "restore":
          patch = { revokedAt: null };
          log = "Intrekking ongedaan gemaakt";
          break;
      }
      await getStore().updateEnrollment(enrollment.id, patch);
      await audit(ctx.user, log, `via ${ctx.clientName}`, user.id);
      return `${user.name}: ${log.charAt(0).toLowerCase()}${log.slice(1)}.`;
    },
  }),

  defineTool({
    name: "academy_set_completion",
    title: "Academy: afronding en certificaat",
    description: "confirm_online (online deel bevestigen als afgerond), undo_online, release_certificate (online certificaat vrijgeven; kan pas als alle modules van het pakket zijn afgerond, alle eindopdrachten voldoende zijn en confirm_online is gedaan; de foutmelding noemt wat nog ontbreekt), withdraw_certificate, release_practical_certificate (praktijkcertificaat; pakket B en praktijkstatus completed), withdraw_practical_certificate, of practical met practicalStatus none, planned of completed.",
    scope: "write",
    input: z.object({
      studentId: id,
      action: z.enum(["confirm_online", "undo_online", "release_certificate", "withdraw_certificate", "release_practical_certificate", "withdraw_practical_certificate", "practical"]),
      practicalStatus: z.enum(["none", "planned", "completed"]).optional(),
    }),
    async run({ studentId, action, practicalStatus }, ctx) {
      const user = await student(studentId);
      const enrollment = await enrollmentOf(user);
      const now = new Date().toISOString();
      let patch: Partial<Enrollment>;
      let log: string;
      switch (action) {
        case "confirm_online":
          patch = { onlineCompletedAt: now };
          log = "Online deel bevestigd als afgerond";
          break;
        case "undo_online":
          patch = { onlineCompletedAt: null, certificateReleasedAt: null };
          log = "Bevestiging online afronding teruggedraaid";
          break;
        case "release_certificate":
        case "withdraw_certificate":
        case "release_practical_certificate":
        case "withdraw_practical_certificate": {
          const op = ({
            release_certificate: "releaseCertificate",
            withdraw_certificate: "withdrawCertificate",
            release_practical_certificate: "releasePractical",
            withdraw_practical_certificate: "withdrawPractical",
          } as const)[action];
          const change = await certificateChange(user, enrollment, op);
          if (!change.ok) throw new ToolError(change.error);
          patch = change.patch;
          log = change.log;
          break;
        }
        case "practical":
          if (!practicalStatus) throw new ToolError("Geef practicalStatus: none, planned of completed.");
          patch = { practicalStatus };
          log = `Praktijkstatus: ${{ none: "nog niet gepland", planned: "gepland", completed: "afgerond" }[practicalStatus]}`;
          break;
      }
      await getStore().updateEnrollment(enrollment.id, patch);
      await audit(ctx.user, log, `via ${ctx.clientName}`, user.id);
      return `${user.name}: ${log}.`;
    },
  }),
];
