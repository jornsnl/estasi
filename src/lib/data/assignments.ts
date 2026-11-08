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
} from "@/lib/domain/assignment";
import { ASSIGNMENT_LIMITS } from "@/lib/domain/assignment";
import { fromRow, toParams, toRow, type Table } from "./rows";
import type {
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
  return rows.map(map<SubmissionVersion>("submission_versions"));
}

export async function getVersion(id: string): Promise<SubmissionVersion | null> {
  if (!isUuid(id)) return null;
  const row = await one<Record<string, unknown>>("select * from public.submission_versions where id = $1", [id]);
  return row ? fromRow<SubmissionVersion>("submission_versions", row) : null;
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
  | { ok: false; reason: "missing"; submission: Submission; missing: string[]; feedbackRefused: boolean };

/**
 * Saves the draft and hands it in: checks the required fields, makes a fixed
 * copy (answers, files and the assignment as it is now) as the next version,
 * and completes the lesson when all its required assignments are in.
 */
export async function submitAssignment(input: DraftInput & { lesson: Lesson }): Promise<SubmitResult> {
  return tx(async (db) => {
    const now = new Date().toISOString();
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
      feedbackStatus: submission.feedbackRequested ? "nieuw" : null,
      submittedAt: now,
    });
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

/**
 * Feedback on a version. send = false keeps it as a draft only the owner
 * sees; sending marks a feedback request on that version as done.
 */
export async function addAssignmentFeedback(input: {
  version: SubmissionVersion;
  authorId: string;
  text: string;
  attachment: FileRef | null;
  send: boolean;
}): Promise<AssignmentFeedback> {
  return tx(async (db) => {
    const now = new Date().toISOString();
    const feedback = await insertRow<AssignmentFeedback>(db, "assignment_feedback", {
      versionId: input.version.id,
      submissionId: input.version.submissionId,
      userId: input.version.userId,
      authorId: input.authorId,
      text: input.text,
      attachment: input.attachment,
      sentAt: input.send ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    await db.query(
      `update public.submission_versions set feedback_status = $2 where id = $1 and feedback_status is not null`,
      [input.version.id, input.send ? "afgerond" : "in_behandeling"],
    );
    return feedback;
  });
}

export async function setFeedbackStatus(versionId: string, status: FeedbackStatus): Promise<void> {
  if (!isUuid(versionId)) return;
  await query("update public.submission_versions set feedback_status = $2 where id = $1", [versionId, status]);
}

/** Assessment of a graded assignment (final assignment): voldoende or verbetering nodig. */
export async function assessSubmission(submissionId: string, status: Extract<SubmissionStatus, "voldoende" | "verbetering_nodig">): Promise<void> {
  if (!isUuid(submissionId)) return;
  await query("update public.assignment_submissions set status = $2, updated_at = now() where id = $1 and status <> 'concept'", [submissionId, status]);
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
