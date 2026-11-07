import "server-only";
import { randomBytes } from "crypto";
import { audit, studentOverview } from "@/lib/academy";
import { getStore, type Answer, type AnswerableBlock, type Block, type Enrollment, type Lesson, type User } from "@/lib/data";
import { ACCESS_LABELS, accessStatus, addMonths, pause, resume } from "@/lib/domain/access";
import { LIMITS } from "@/lib/domain/input";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { COURSE_STATUS_LABELS, feedbackState, isAnswerable, isAnswered } from "@/lib/domain/progress";
import { formatDate, fromDateInput } from "@/lib/util/format";
import { newId } from "@/lib/util/id";
import { defineTool, ToolError, z } from "../tool";

/** MCP tools for the Wedding Plan Academy (students, progress, feedback, content). */

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
    activated: Boolean(o.user.activatedAt),
    lastActiveAt: o.user.lastActiveAt,
  };
}

const blockSummary = (b: Block) => {
  switch (b.type) {
    case "video":
      return { id: b.id, type: b.type, url: b.url, caption: b.caption };
    case "text":
      return { id: b.id, type: b.type, markdown: b.markdown };
    case "download":
      return { id: b.id, type: b.type, label: b.label, description: b.description, url: b.url, file: b.file?.name ?? null };
    case "question":
      return { id: b.id, type: b.type, kind: b.kind, prompt: b.prompt, helpText: b.helpText, required: b.required, feedbackAssignment: b.feedback };
    case "choice":
      return { id: b.id, type: b.type, prompt: b.prompt, options: b.options, required: b.required, feedbackAssignment: b.feedback };
    case "upload":
      return { id: b.id, type: b.type, prompt: b.prompt, helpText: b.helpText, required: b.required, feedbackAssignment: b.feedback };
  }
};

function promptOf(lesson: Lesson | undefined, blockId: string): string {
  const block = lesson?.blocks.find((b) => b.id === blockId);
  return block && isAnswerable(block) ? block.prompt : "(vraag niet meer in de les)";
}

const answerText = (a: Answer) => ({
  text: a.text,
  choice: a.choice,
  files: a.files.map((f) => f.name),
});

export const academyTools = [
  defineTool({
    name: "academy_overview",
    title: "Academy: overzicht",
    description: "Kerncijfers van de Wedding Plan Academy: actieve cursisten, wie wacht op bevestiging van de online afronding, openstaande feedback en verlopen of gepauzeerde toegang. Begin hier voor een dagelijkse stand van zaken.",
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
          ownerNotes: overview.enrollment.ownerNotes,
        },
        modules: overview.progress.map((p) => ({
          title: p.module.title,
          state: p.state,
          lessons: p.lessons.map((l) => ({ id: l.id, title: l.title, completed: p.completedLessonIds.has(l.id) })),
        })),
        recentLog: log.slice(0, 15).map((e) => ({ at: e.at, action: e.action, details: e.details })),
      };
    },
  }),

  defineTool({
    name: "academy_list_open_feedback",
    title: "Academy: openstaande feedback",
    description: "Antwoorden op feedbackopdrachten die nog op feedback van de opleider wachten, of die de cursist na de laatste feedback heeft aangepast. Met de vraag, het antwoord en het answerId voor academy_give_feedback. Oudste eerst.",
    scope: "read",
    input: z.object({
      studentId: id.optional().describe("Alleen voor deze cursist"),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    async run({ studentId, limit }) {
      const store = getStore();
      const only = studentId ? await student(studentId) : null;
      const [lessons, answers, feedback, users] = await Promise.all([
        store.listLessons(),
        store.listAnswers(only ? { userId: only.id } : {}),
        store.listFeedback(only ? { userId: only.id } : {}),
        store.listUsers("student"),
      ]);
      const blocks = new Map<string, { lesson: Lesson; block: AnswerableBlock; prompt: string }>();
      for (const lesson of lessons) for (const b of lesson.blocks) if (isAnswerable(b) && b.feedback) blocks.set(b.id, { lesson, block: b, prompt: b.prompt });
      const names = new Map(users.map((u) => [u.id, u.name]));
      return answers
        .filter((a) => blocks.has(a.blockId) && isAnswered(blocks.get(a.blockId)!.block, a))
        .map((a) => ({ a, state: feedbackState(a, feedback) }))
        .filter(({ state }) => state === "open" || state === "changed_after_feedback")
        .sort((x, y) => x.a.updatedAt.localeCompare(y.a.updatedAt))
        .slice(0, limit)
        .map(({ a, state }) => ({
          answerId: a.id,
          student: { id: a.userId, name: names.get(a.userId) ?? "?" },
          lesson: { id: a.lessonId, title: blocks.get(a.blockId)!.lesson.title },
          question: blocks.get(a.blockId)!.prompt,
          answer: answerText(a),
          state: state === "open" ? "wacht op feedback" : "aangepast na feedback",
          updatedAt: a.updatedAt,
          previousFeedback: feedback.filter((f) => f.answerId === a.id).map((f) => ({ at: f.createdAt, text: f.text })),
        }));
    },
  }),

  defineTool({
    name: "academy_get_answers",
    title: "Academy: antwoorden van een cursist",
    description: "Alle antwoorden van een cursist, per les, met de vraag en de gegeven feedback. Optioneel voor één les.",
    scope: "read",
    input: z.object({ studentId: id.describe("Id of e-mailadres van de cursist"), lessonId: id.optional() }),
    async run({ studentId, lessonId }) {
      const user = await student(studentId);
      const store = getStore();
      const [lessons, answers, feedback] = await Promise.all([
        store.listLessons(),
        store.listAnswers({ userId: user.id, lessonId }),
        store.listFeedback({ userId: user.id }),
      ]);
      const byId = new Map(lessons.map((l) => [l.id, l]));
      return answers.map((a) => ({
        answerId: a.id,
        lesson: byId.get(a.lessonId)?.title ?? "(les verwijderd)",
        lessonId: a.lessonId,
        question: promptOf(byId.get(a.lessonId), a.blockId),
        answer: answerText(a),
        version: a.version,
        updatedAt: a.updatedAt,
        feedback: feedback.filter((f) => f.answerId === a.id).map((f) => ({ at: f.createdAt, text: f.text, forVersion: f.answerVersion })),
      }));
    },
  }),

  defineTool({
    name: "academy_list_content",
    title: "Academy: lesinhoud",
    description: "De opbouw van de opleiding: modules op volgorde met hun lessen (id, titel, samenvatting, aantal vragen en feedbackopdrachten).",
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
            questions: l.blocks.filter(isAnswerable).length,
            feedbackAssignments: l.blocks.filter((b) => isAnswerable(b) && b.feedback).length,
          })),
      }));
    },
  }),

  defineTool({
    name: "academy_get_lesson",
    title: "Academy: les",
    description: "Eén les met alle blokken: video's, tekst (markdown), downloads en vragen (open, reflectie, praktijk, meerkeuze, bestand), inclusief of ze verplicht zijn en of het een feedbackopdracht is.",
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
    description: "Geeft schriftelijke feedback op een antwoord (answerId uit academy_list_open_feedback). De cursist ziet de feedback direct bij de opdracht. Laat de gebruiker de tekst eerst goedkeuren.",
    scope: "write",
    input: z.object({ answerId: id, text: z.string().trim().min(1).max(LIMITS.feedback) }),
    async run({ answerId, text }, ctx) {
      const store = getStore();
      const answer = await store.getAnswer(answerId);
      if (!answer) throw new ToolError("Antwoord niet gevonden.");
      await store.createFeedback({
        id: newId(),
        answerId: answer.id,
        userId: answer.userId,
        authorId: ctx.user.id,
        text,
        attachment: null,
        answerVersion: answer.version,
        createdAt: new Date().toISOString(),
      });
      await audit(ctx.user, "Feedback gegeven", `via ${ctx.clientName}`, answer.userId);
      return "Feedback opgeslagen. De cursist ziet deze bij de opdracht.";
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
    description: "confirm_online (online deel bevestigen als afgerond), undo_online, release_certificate (certificaat vrijgeven; kan pas na confirm_online), withdraw_certificate, of practical met practicalStatus none, planned of completed.",
    scope: "write",
    input: z.object({
      studentId: id,
      action: z.enum(["confirm_online", "undo_online", "release_certificate", "withdraw_certificate", "practical"]),
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
          if (!enrollment.onlineCompletedAt) throw new ToolError("Bevestig eerst de online afronding (confirm_online).");
          patch = {
            certificateReleasedAt: now,
            certificateCode: enrollment.certificateCode ?? `WPA-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`,
          };
          log = "Online certificaat vrijgegeven";
          break;
        case "withdraw_certificate":
          patch = { certificateReleasedAt: null };
          log = "Certificaat ingetrokken";
          break;
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
