import "server-only";
import type pg from "pg";
import { isUuid, one, pool, query, tx, type Queryable } from "@/lib/db";
import {
  cleanAnswers,
  FEEDBACK_LIMIT,
  feedbackRequestAllowed,
  lessonCompletion,
  missingRequiredFields,
  uploadProblem,
  withKnownUploadKinds,
} from "@/lib/domain/assignment";
import { ASSIGNMENT_LIMITS } from "@/lib/domain/assignment";
import { assessmentProblem, nextFeedbackStatus } from "@/lib/domain/feedback";
import { fromRow, toParams, toRow, type Table } from "./rows";
import type {
  Assessment,
  AssignmentAnswers,
  AssignmentBlock,
  AssignmentFeedback,
  AssignmentField,
  FeedbackStatus,
  FileRef,
  Lesson,
  ModuleUnlock,
  Submission,
  SubmissionStatus,
  SubmissionVersion,
} from "./types";

/**
 * Assignments in Postgres (migration 0025): a student's draft and status per
 * assignment (assignment_submissions), a fixed copy per submit
 * (submission_versions), feedback per version (assignment_feedback) and
 * modules the owner opened early (module_unlocks). The server actions check
 * the role and access before they get here.
 */

const map = <T>(table: Table) => (row: Record<string, unknown>) => fromRow<T>(table, row);

/** A version as stored; upload kinds that no longer exist (mp4) are dropped from its copy of the assignment. */
const versionFrom = (row: Record<string, unknown>): SubmissionVersion => {
  const v = fromRow<SubmissionVersion>("submission_versions", row);
  return v.assignment ? { ...v, assignment: withKnownUploadKinds(v.assignment) } : v;
};

async function insertRow<T>(db: Queryable, table: Table, value: object): Promise<T> {
  const row = toRow(table, value, true);
  const columns = Object.keys(row);
  const { rows } = await db.query(
    `insert into public.${table} (${columns.map((c) => `"${c}"`).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    toParams(table, row),
  );
  return fromRow<T>(table, rows[0]);
}

// Reading ------------------------------------------------------------------------

export async function listSubmissions(filter: { userId?: string; lessonId?: string }): Promise<Submission[]> {
  if ((filter.userId && !isUuid(filter.userId)) || (filter.lessonId && !isUuid(filter.lessonId))) return [];
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) where.push(`user_id = $${params.push(filter.userId)}`);
  if (filter.lessonId) where.push(`lesson_id = $${params.push(filter.lessonId)}`);
  const rows = await query<Record<string, unknown>>(
    `select * from public.assignment_submissions${where.length ? ` where ${where.join(" and ")}` : ""} order by created_at`,
    params,
  );
  return rows.map(map<Submission>("assignment_submissions"));
}

export async function getSubmissionById(id: string): Promise<Submission | null> {
  if (!isUuid(id)) return null;
  const row = await one<Record<string, unknown>>("select * from public.assignment_submissions where id = $1", [id]);
  return row ? fromRow<Submission>("assignment_submissions", row) : null;
}

export async function listVersions(filter: { userId?: string; submissionId?: string }): Promise<SubmissionVersion[]> {
  if ((filter.userId && !isUuid(filter.userId)) || (filter.submissionId && !isUuid(filter.submissionId))) return [];
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) where.push(`user_id = $${params.push(filter.userId)}`);
  if (filter.submissionId) where.push(`submission_id = $${params.push(filter.submissionId)}`);
  const rows = await query<Record<string, unknown>>(
    `select * from public.submission_versions${where.length ? ` where ${where.join(" and ")}` : ""} order by submitted_at, version`,
    params,
  );
  return rows.map(versionFrom);
}

export async function getVersion(id: string): Promise<SubmissionVersion | null> {
  if (!isUuid(id)) return null;
  const row = await one<Record<string, unknown>>("select * from public.submission_versions where id = $1", [id]);
  return row ? versionFrom(row) : null;
}

/** Feedback of one student (or everyone). Students only ever get the sent ones (sentOnly). */
export async function listAssignmentFeedback(filter: { userId?: string; sentOnly?: boolean }): Promise<AssignmentFeedback[]> {
  if (filter.userId && !isUuid(filter.userId)) return [];
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) where.push(`user_id = $${params.push(filter.userId)}`);
  if (filter.sentOnly) where.push("sent_at is not null");
  const rows = await query<Record<string, unknown>>(
    `select * from public.assignment_feedback${where.length ? ` where ${where.join(" and ")}` : ""} order by created_at`,
    params,
  );
  return rows.map(map<AssignmentFeedback>("assignment_feedback"));
}

// Feedback limit ------------------------------------------------------------------

/**
 * Other assignments in this module with a feedback request by this student:
 * a request in a draft, or one handed in with an earlier version.
 */
export async function feedbackRequestsInModule(
  userId: string,
  moduleId: string,
  except: { lessonId: string; blockId: string } | null = null,
  db: Queryable = pool(),
): Promise<number> {
  if (!isUuid(userId) || !isUuid(moduleId)) return 0;
  const row = await one<{ n: number }>(
    `select count(*)::int as n
       from public.assignment_submissions s
       join public.lessons l on l.id = s.lesson_id
      where s.user_id = $1 and l.module_id = $2
        and not (s.lesson_id::text = $3 and s.block_id = $4)
        and (s.feedback_requested or exists (
              select 1 from public.submission_versions v where v.submission_id = s.id and v.feedback_requested))`,
    [userId, moduleId, except?.lessonId ?? "", except?.blockId ?? ""],
    db,
  );
  return row?.n ?? 0;
}

// Writing a draft --------------------------------------------------------------------

export interface DraftInput {
  userId: string;
  lesson: Pick<Lesson, "id" | "moduleId">;
  assignment: AssignmentBlock;
  /** The draft_version the browser started from; 0 for a first save. */
  expectedVersion: number;
  /** Answers as the browser sends them (cleaned with cleanAnswers). */
  answers: unknown;
  feedbackRequested: boolean;
  questionForSabine: string;
  /** Overwrite a newer draft (the student chose "mijn versie bewaren" after a conflict). */
  force?: boolean;
}

export type DraftResult =
  | { ok: true; submission: Submission; feedbackRefused: boolean }
  | { ok: false; reason: "conflict"; submission: Submission };

async function lockSubmission(db: pg.PoolClient, userId: string, lessonId: string, blockId: string, now: string): Promise<Submission> {
  // Creates the row when it is not there yet, then locks it for this transaction.
  await db.query(
    `insert into public.assignment_submissions (user_id, lesson_id, block_id, draft_version, created_at, updated_at)
     values ($1, $2, $3, 0, $4, $4) on conflict (user_id, lesson_id, block_id) do nothing`,
    [userId, lessonId, blockId, now],
  );
  const { rows } = await db.query(
    "select * from public.assignment_submissions where user_id = $1 and lesson_id = $2 and block_id = $3 for update",
    [userId, lessonId, blockId],
  );
  return fromRow<Submission>("assignment_submissions", rows[0]);
}

async function writeDraft(db: pg.PoolClient, input: DraftInput, now: string): Promise<DraftResult> {
  const { userId, lesson, assignment } = input;
  const current = await lockSubmission(db, userId, lesson.id, assignment.id, now);
  if (!input.force && current.draftVersion !== input.expectedVersion) return { ok: false, reason: "conflict", submission: current };

  const draft = cleanAnswers(assignment, input.answers, current.draft ?? {});
  let feedbackRequested = assignment.feedbackAllowed && input.feedbackRequested;
  let feedbackRefused = false;
  if (feedbackRequested && !current.feedbackRequested) {
    // One request at a time per student and module, so two tabs can never pass the limit together.
    await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`feedback:${userId}:${lesson.moduleId}`]);
    const others = await feedbackRequestsInModule(userId, lesson.moduleId, { lessonId: lesson.id, blockId: assignment.id }, db);
    if (!feedbackRequestAllowed(others)) {
      feedbackRequested = false;
      feedbackRefused = true;
    }
  }
  const question = feedbackRequested ? input.questionForSabine.trim().slice(0, ASSIGNMENT_LIMITS.question) : "";
  const { rows } = await db.query(
    `update public.assignment_submissions
        set draft = $2, draft_version = draft_version + 1, feedback_requested = $3, question_for_sabine = $4, updated_at = $5
      where id = $1 returning *`,
    [current.id, JSON.stringify(draft), feedbackRequested, question, now],
  );
  return { ok: true, submission: fromRow<Submission>("assignment_submissions", rows[0]), feedbackRefused };
}

/** Saves the draft (autosave). Always possible, also with required fields still empty. */
export async function saveDraft(input: DraftInput): Promise<DraftResult> {
  return tx((db) => writeDraft(db, input, new Date().toISOString()));
}

// Files ------------------------------------------------------------------------------------

export type AddFileResult = { ok: true; submission: Submission } | { ok: false; error: string };

/**
 * Adds an uploaded file to an upload field of the draft. The file has been
 * checked with uploadProblem before it was stored; the count is checked again
 * here, inside the transaction.
 */
export async function addDraftFile(
  userId: string,
  lessonId: string,
  assignment: AssignmentBlock,
  field: Extract<AssignmentField, { type: "upload" }>,
  file: FileRef,
): Promise<AddFileResult> {
  return tx(async (db) => {
    const now = new Date().toISOString();
    const current = await lockSubmission(db, userId, lessonId, assignment.id, now);
    const draft: AssignmentAnswers = { ...(current.draft ?? {}) };
    const files = draft[field.id]?.files ?? [];
    const problem = uploadProblem(field, { name: file.name, size: file.size }, files.length);
    if (problem) return { ok: false, error: problem };
    draft[field.id] = { ...draft[field.id], files: [...files, file] };
    const { rows } = await db.query(
      "update public.assignment_submissions set draft = $2, draft_version = draft_version + 1, updated_at = $3 where id = $1 returning *",
      [current.id, JSON.stringify(draft), now],
    );
    return { ok: true, submission: fromRow<Submission>("assignment_submissions", rows[0]) };
  });
}

// Submitting -----------------------------------------------------------------------------------

export type SubmitResult =
  | { ok: true; submission: Submission; version: SubmissionVersion; feedbackRefused: boolean; lessonCompleted: boolean }
  | { ok: false; reason: "conflict"; submission: Submission }
  | { ok: false; reason: "assessed"; submission: Submission }
  | { ok: false; reason: "missing"; submission: Submission; missing: string[]; feedbackRefused: boolean };

/**
 * Saves the draft and hands it in: checks the required fields, makes a fixed
 * copy (answers, files and the assignment as it is now) as the next version,
 * and completes the lesson when all its required assignments are in.
 */
export async function submitAssignment(input: DraftInput & { lesson: Lesson }): Promise<SubmitResult> {
  return tx(async (db) => {
    const now = new Date().toISOString();
    const before = await lockSubmission(db, input.userId, input.lesson.id, input.assignment.id, now);
    // Assessed as voldoende: done, a new version would undo the assessment.
    if (before.status === "voldoende") return { ok: false, reason: "assessed", submission: before };
    const saved = await writeDraft(db, input, now);
    if (!saved.ok) return saved;
    const { submission, feedbackRefused } = saved;
    const missing = missingRequiredFields(input.assignment, submission.draft);
    if (missing.length > 0) return { ok: false, reason: "missing", submission, missing: missing.map((f) => f.id), feedbackRefused };

    const { rows: [{ next }] } = await db.query(
      "select coalesce(max(version), 0) + 1 as next from public.submission_versions where submission_id = $1",
      [submission.id],
    );
    const version = await insertRow<SubmissionVersion>(db, "submission_versions", {
      submissionId: submission.id,
      userId: input.userId,
      version: next,
      answers: submission.draft,
      assignment: input.assignment,
      feedbackRequested: submission.feedbackRequested,
      questionForSabine: submission.questionForSabine,
      // A final assignment waits for the owner's assessment, also without a feedback request.
      feedbackStatus: nextFeedbackStatus(null, { type: "submitted", requested: submission.feedbackRequested, graded: input.assignment.graded }),
      submittedAt: now,
    });
    if (input.assignment.graded) {
      // An earlier version that only waited for the assessment is replaced by this one.
      await db.query(
        `update public.submission_versions set feedback_status = null
          where submission_id = $1 and id <> $2 and not feedback_requested and feedback_status = 'nieuw'`,
        [submission.id, version.id],
      );
    }
    const { rows } = await db.query(
      "update public.assignment_submissions set status = 'ingediend', submitted_at = $2, updated_at = $2 where id = $1 returning *",
      [submission.id, now],
    );
    const updated = fromRow<Submission>("assignment_submissions", rows[0]);

    const { rows: lessonSubs } = await db.query(
      "select block_id, status from public.assignment_submissions where user_id = $1 and lesson_id = $2",
      [input.userId, input.lesson.id],
    );
    const completion = lessonCompletion(
      input.lesson.blocks,
      lessonSubs.map((r: { block_id: string; status: SubmissionStatus }) => ({ blockId: r.block_id, status: r.status })),
    );
    let lessonCompleted = false;
    if (completion.complete) {
      const done = await db.query(
        "insert into public.lesson_completions (user_id, lesson_id, completed_at) values ($1, $2, $3) on conflict do nothing",
        [input.userId, input.lesson.id, now],
      );
      lessonCompleted = (done.rowCount ?? 0) > 0;
    }
    return { ok: true, submission: updated, version, feedbackRefused, lessonCompleted };
  });
}

// Owner ----------------------------------------------------------------------------------------

export interface FeedbackInput {
  version: SubmissionVersion;
  authorId: string;
  text: string;
  /** A new attachment; undefined keeps the one of the concept, null removes it. */
  attachment?: FileRef | null;
  /** Only for a final assignment (graded); applied to the submission when sent. */
  assessment?: Assessment | null;
  /** false: (keep) as a concept only the owner sees; true: send it to the student. */
  send: boolean;
}

export type FeedbackResult =
  | { ok: true; feedback: AssignmentFeedback; assessed: Assessment | null }
  | { ok: false; error: string };

/**
 * Writes the owner's feedback on a version: there is at most one concept per
 * version, which is updated until it is sent. Sending stamps it, marks the
 * request as done and applies the assessment of a final assignment. The
 * caller notifies the student (notifyFeedbackSent).
 */
export async function saveFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  return tx(async (db) => {
    const now = new Date().toISOString();
    const { rows: [versionRow] } = await db.query("select * from public.submission_versions where id = $1 for update", [input.version.id]);
    if (!versionRow) return { ok: false as const, error: "Deze versie bestaat niet meer." };
    const version = fromRow<SubmissionVersion>("submission_versions", versionRow);
    const { rows: [concept] } = await db.query("select * from public.assignment_feedback where version_id = $1 and sent_at is null", [version.id]);
    const current = concept ? fromRow<AssignmentFeedback>("assignment_feedback", concept) : null;
    const attachment = input.attachment === undefined ? (current?.attachment ?? null) : input.attachment;
    const assessment = input.assessment ?? null;
    const text = input.text.trim();
    if (!text && !attachment && !assessment) return { ok: false as const, error: "Schrijf eerst je feedback." };

    let assessed: Assessment | null = null;
    if (assessment) {
      const { rows: [sub] } = await db.query("select status from public.assignment_submissions where id = $1 for update", [version.submissionId]);
      const { rows: [latest] } = await db.query("select max(version)::int as v from public.submission_versions where submission_id = $1", [version.submissionId]);
      const problem = assessmentProblem({ graded: version.assignment?.graded === true, isLatest: latest?.v === version.version, status: sub?.status ?? "concept" });
      if (problem) return { ok: false as const, error: problem };
      if (input.send) {
        await db.query("update public.assignment_submissions set status = $2, updated_at = $3 where id = $1", [version.submissionId, assessment, now]);
        assessed = assessment;
      }
    }

    const values = { text, attachment, assessment, sentAt: input.send ? now : null, updatedAt: now };
    let feedback: AssignmentFeedback;
    if (current) {
      const { rows } = await db.query(
        `update public.assignment_feedback set text = $2, attachment = $3, assessment = $4, sent_at = $5, updated_at = $6, author_id = $7
          where id = $1 returning *`,
        [current.id, text, attachment ? JSON.stringify(attachment) : null, assessment, values.sentAt, now, input.authorId],
      );
      feedback = fromRow<AssignmentFeedback>("assignment_feedback", rows[0]);
    } else {
      feedback = await insertRow<AssignmentFeedback>(db, "assignment_feedback", {
        versionId: version.id,
        submissionId: version.submissionId,
        userId: version.userId,
        authorId: input.authorId,
        ...values,
        seenAt: null,
        createdAt: now,
      });
    }
    const status = nextFeedbackStatus(version.feedbackStatus, { type: input.send ? "sent" : "concept" });
    if (status !== version.feedbackStatus) {
      await db.query("update public.submission_versions set feedback_status = $2 where id = $1", [version.id, status]);
    }
    return { ok: true as const, feedback, assessed };
  });
}

/** Throws the concept of a version away (the attachment file stays, as with other uploads). */
export async function deleteFeedbackConcept(versionId: string): Promise<boolean> {
  if (!isUuid(versionId)) return false;
  const rows = await query("delete from public.assignment_feedback where version_id = $1 and sent_at is null returning id", [versionId]);
  return rows.length > 0;
}

/** The owner sets the status by hand; a version without a request or final assignment has none. */
export async function setFeedbackStatus(versionId: string, status: FeedbackStatus): Promise<boolean> {
  if (!isUuid(versionId)) return false;
  const rows = await query("update public.submission_versions set feedback_status = $2 where id = $1 and feedback_status is not null returning id", [versionId, status]);
  return rows.length > 0;
}

/** Assessment of a graded assignment (final assignment) without feedback text. */
export async function assessSubmission(submissionId: string, status: Assessment): Promise<void> {
  if (!isUuid(submissionId)) return;
  await query("update public.assignment_submissions set status = $2, updated_at = now() where id = $1 and status <> 'concept'", [submissionId, status]);
}

// Feedback overview (owner) --------------------------------------------------------------

export interface FeedbackRequest {
  versionId: string;
  version: number;
  submissionId: string;
  userId: string;
  studentName: string;
  lessonId: string;
  lessonTitle: string | null;
  moduleId: string | null;
  moduleTitle: string | null;
  modulePosition: number | null;
  assignment: AssignmentBlock;
  answers: AssignmentAnswers;
  feedbackRequested: boolean;
  feedbackStatus: FeedbackStatus;
  questionForSabine: string;
  submittedAt: string;
  submissionStatus: SubmissionStatus;
  /** There is a concept that has not been sent yet. */
  hasConcept: boolean;
  lastSentAt: string | null;
}

/**
 * Every version that waits or waited for the owner: a feedback request, or
 * the latest version of a final assignment. Newest first; the caller filters
 * (matchesRequest).
 */
export async function listFeedbackRequests(filter: { userId?: string } = {}): Promise<FeedbackRequest[]> {
  if (filter.userId && !isUuid(filter.userId)) return [];
  const rows = await query<Record<string, unknown>>(
    `select v.id as version_id, v.version, v.submission_id, v.user_id, u.name as student_name, s.lesson_id,
            l.title as lesson_title, m.id as module_id, m.title as module_title, m.position as module_position,
            v.assignment, v.answers, v.feedback_requested, v.feedback_status, v.question_for_sabine, v.submitted_at, s.status as submission_status,
            exists (select 1 from public.assignment_feedback f where f.version_id = v.id and f.sent_at is null) as has_concept,
            (select max(f.sent_at) from public.assignment_feedback f where f.version_id = v.id) as last_sent_at
       from public.submission_versions v
       join public.assignment_submissions s on s.id = v.submission_id
       join public.users u on u.id = v.user_id
       left join public.lessons l on l.id = s.lesson_id
       left join public.modules m on m.id = l.module_id
      where v.feedback_status is not null${filter.userId ? " and v.user_id = $1" : ""}
      order by v.submitted_at desc, v.version desc`,
    filter.userId ? [filter.userId] : [],
  );
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(String(d)).toISOString() : null);
  return rows.map((r) => ({
    versionId: String(r.version_id),
    version: Number(r.version),
    submissionId: String(r.submission_id),
    userId: String(r.user_id),
    studentName: String(r.student_name),
    lessonId: String(r.lesson_id),
    lessonTitle: (r.lesson_title as string | null) ?? null,
    moduleId: r.module_id ? String(r.module_id) : null,
    moduleTitle: (r.module_title as string | null) ?? null,
    modulePosition: r.module_position === null || r.module_position === undefined ? null : Number(r.module_position),
    assignment: withKnownUploadKinds(r.assignment as AssignmentBlock),
    answers: (r.answers as AssignmentAnswers) ?? {},
    feedbackRequested: r.feedback_requested === true,
    feedbackStatus: r.feedback_status as FeedbackStatus,
    questionForSabine: String(r.question_for_sabine ?? ""),
    submittedAt: iso(r.submitted_at)!,
    submissionStatus: r.submission_status as SubmissionStatus,
    hasConcept: r.has_concept === true,
    lastSentAt: iso(r.last_sent_at),
  }));
}

/** For the counter in the admin menu: requests that wait (nieuw or in behandeling). */
export async function openFeedbackRequestCount(): Promise<number> {
  const row = await one<{ n: number }>(
    "select count(*)::int as n from public.submission_versions where feedback_status in ('nieuw', 'in_behandeling')",
  );
  return row?.n ?? 0;
}

// Feedback seen by the student --------------------------------------------------------------

/** Sent feedback the student has not opened yet (badge in the Academy menu). */
export async function unseenFeedback(userId: string): Promise<{ id: string; submissionId: string; lessonId: string; blockId: string; sentAt: string }[]> {
  if (!isUuid(userId)) return [];
  const rows = await query<{ id: string; submission_id: string; lesson_id: string; block_id: string; sent_at: Date }>(
    `select f.id, f.submission_id, s.lesson_id, s.block_id, f.sent_at
       from public.assignment_feedback f join public.assignment_submissions s on s.id = f.submission_id
      where f.user_id = $1 and f.sent_at is not null and f.seen_at is null
      order by f.sent_at desc`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, submissionId: r.submission_id, lessonId: r.lesson_id, blockId: r.block_id, sentAt: new Date(r.sent_at).toISOString() }));
}

/** The student opened the lesson with this feedback. */
export async function markFeedbackSeen(userId: string, submissionIds: string[]): Promise<void> {
  const ids = submissionIds.filter(isUuid);
  if (!isUuid(userId) || ids.length === 0) return;
  await query(
    "update public.assignment_feedback set seen_at = now() where user_id = $1 and submission_id = any($2::uuid[]) and sent_at is not null and seen_at is null",
    [userId, ids],
  );
}

// Module unlocks ---------------------------------------------------------------------------

export async function listUnlocks(userId: string): Promise<ModuleUnlock[]> {
  if (!isUuid(userId)) return [];
  const rows = await query<Record<string, unknown>>("select * from public.module_unlocks where user_id = $1", [userId]);
  return rows.map(map<ModuleUnlock>("module_unlocks"));
}

export async function unlockModule(userId: string, moduleId: string, ownerId: string): Promise<void> {
  if (!isUuid(userId) || !isUuid(moduleId)) return;
  await query(
    "insert into public.module_unlocks (user_id, module_id, unlocked_by) values ($1, $2, $3) on conflict do nothing",
    [userId, moduleId, ownerId],
  );
}

export async function relockModule(userId: string, moduleId: string): Promise<void> {
  if (!isUuid(userId) || !isUuid(moduleId)) return;
  await query("delete from public.module_unlocks where user_id = $1 and module_id = $2", [userId, moduleId]);
}

export { FEEDBACK_LIMIT };
