// Rules for assignments (lesson blocks of type "assignment"): field types,
// cleaning up what the lesson editor and the student send, required fields,
// the feedback limit, comparing a repeated scan, and turning the old question,
// choice and upload blocks into assignments. Pure functions without server
// imports, so the client components and the tests use them too.

import type {
  AssignmentAnswers,
  AssignmentBlock,
  AssignmentField,
  AssignmentPart,
  Block,
  FieldAnswer,
  FieldType,
  FileRef,
  LegacyBlock,
  ScaleRow,
  StoredBlock,
  Submission,
  SubmissionStatus,
  UploadKind,
} from "@/lib/data/types";
import { videoEmbed } from "@/lib/util/video";

// Limits ----------------------------------------------------------------------

export const ASSIGNMENT_LIMITS = {
  title: 300,
  intro: 5000,
  label: 2000,
  help: 3000,
  option: 300,
  options: 30,
  rows: 40,
  parts: 20,
  fieldsPerPart: 40,
  shortAnswer: 500,
  answer: 20_000,
  comment: 5000,
  rowText: 2000,
  question: 2000,
  url: 500,
  maxFiles: 20,
  scaleMin: 0,
  scaleMax: 10,
} as const;

/** Max personal feedback requests per student per module (Academy 8). */
export const FEEDBACK_LIMIT = 2;

export const FIELD_TYPES: FieldType[] = ["short", "long", "single", "multi", "scale", "scale_rows", "upload", "video_link"];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short: "Kort antwoord",
  long: "Lang antwoord",
  single: "Meerkeuze (één antwoord)",
  multi: "Meerkeuze (meerdere antwoorden)",
  scale: "Schaalvraag",
  scale_rows: "Schaal per onderwerp",
  upload: "Bestand uploaden",
  video_link: "Videolink (YouTube of Vimeo)",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  concept: "Concept",
  ingediend: "Ingediend",
  verbetering_nodig: "Verbetering nodig",
  voldoende: "Voldoende",
};

/** Status that counts as handed in (also after an assessment). */
export const isSubmitted = (status: SubmissionStatus | undefined | null) => !!status && status !== "concept";

// Uploads -----------------------------------------------------------------------

const MB = 1024 * 1024;

export const UPLOAD_KINDS: Record<UploadKind, { label: string; extensions: string[]; maxBytes: number }> = {
  pdf: { label: "Pdf", extensions: ["pdf"], maxBytes: 10 * MB },
  docx: { label: "Word (.docx)", extensions: ["docx", "doc"], maxBytes: 10 * MB },
  xlsx: { label: "Excel (.xlsx)", extensions: ["xlsx", "xls"], maxBytes: 10 * MB },
  pptx: { label: "PowerPoint (.pptx)", extensions: ["pptx", "ppt"], maxBytes: 10 * MB },
  jpg: { label: "Afbeelding (.jpg)", extensions: ["jpg", "jpeg"], maxBytes: 10 * MB },
  png: { label: "Afbeelding (.png)", extensions: ["png"], maxBytes: 10 * MB },
  // No video files: a video is handed in as a YouTube or Vimeo link (field type video_link).
  audio: { label: "Audio (.mp3, .m4a, .wav)", extensions: ["mp3", "m4a", "wav", "aac", "ogg"], maxBytes: 10 * MB },
};

export const ALL_UPLOAD_KINDS = Object.keys(UPLOAD_KINDS) as UploadKind[];

/** Largest upload any field allows (10 MB); next.config.mjs (12mb) leaves room for it and the rest of the form. */
export const MAX_ASSIGNMENT_UPLOAD_BYTES = Math.max(...Object.values(UPLOAD_KINDS).map((k) => k.maxBytes));

export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function uploadKindOf(name: string): UploadKind | null {
  const ext = extensionOf(name);
  return ALL_UPLOAD_KINDS.find((k) => UPLOAD_KINDS[k].extensions.includes(ext)) ?? null;
}

/** The accept attribute of a file input for these kinds. */
export const acceptFor = (kinds: UploadKind[]) => kinds.flatMap((k) => UPLOAD_KINDS[k].extensions.map((e) => `.${e}`)).join(",");

export const formatMb = (bytes: number) => `${Math.round(bytes / MB)} MB`;

/**
 * Checks one file against an upload field. Returns the reason in Dutch, or
 * null when the file may be added. Used by the server action (the client only
 * checks to warn early).
 */
export function uploadProblem(
  field: { accept: UploadKind[]; maxFiles: number },
  file: { name: string; size: number },
  currentCount: number,
): string | null {
  if (currentCount >= field.maxFiles) {
    return field.maxFiles === 1 ? "Hier past één bestand. Verwijder eerst het huidige bestand." : `Hier passen maximaal ${field.maxFiles} bestanden.`;
  }
  const kind = uploadKindOf(file.name);
  if (!kind || !field.accept.includes(kind)) {
    const ext = extensionOf(file.name);
    return `${ext ? `Bestandstype .${ext}` : "Dit bestandstype"} is hier niet toegestaan. Toegestaan: ${field.accept.map((k) => UPLOAD_KINDS[k].label).join(", ")}.`;
  }
  if (file.size <= 0) return "Het bestand is leeg.";
  if (file.size > UPLOAD_KINDS[kind].maxBytes) return `Het bestand is groter dan ${formatMb(UPLOAD_KINDS[kind].maxBytes)}.`;
  return null;
}

// New blocks ---------------------------------------------------------------------

const DEFAULT_SCALE = { min: 1, max: 5, minLabel: "", maxLabel: "", explanation: "" };

export function newField(type: FieldType, id: string): AssignmentField {
  const base = { id, label: "", help: "", required: true };
  switch (type) {
    case "single":
    case "multi":
      return { ...base, type, options: ["", ""], allowComment: false };
    case "scale":
      return { ...base, type, ...DEFAULT_SCALE };
    case "scale_rows":
      return { ...base, type, ...DEFAULT_SCALE, rows: [], mode: "score" };
    case "upload":
      return { ...base, type, required: false, accept: ["pdf", "docx", "jpg", "png"], maxFiles: 1 };
    case "video_link":
      return { ...base, type };
    case "short":
    case "long":
    default:
      return { ...base, type: type === "short" ? "short" : "long" };
  }
}

export const newPart = (id: string, fields: AssignmentField[] = []): AssignmentPart => ({ id, title: "", intro: "", fields });

export function newAssignment(id: string, makeId: () => string): AssignmentBlock {
  return {
    id,
    type: "assignment",
    title: "",
    intro: "",
    requiredForLesson: true,
    feedbackAllowed: false,
    graded: false,
    repeatOf: null,
    parts: [newPart(makeId(), [newField("long", makeId())])],
  };
}

export const allFields = (assignment: AssignmentBlock): AssignmentField[] => assignment.parts.flatMap((p) => p.fields);

// Cleaning up input -------------------------------------------------------------------

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const asString = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const asId = (value: unknown, fallback: () => string) => (typeof value === "string" && ID.test(value) ? value : fallback());
const asInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Unique ids: a duplicate (copied field, edited JSON) gets a fresh one. */
function uniqueIds<T extends { id: string }>(items: T[], seen: Set<string>, makeId: () => string): T[] {
  return items.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    const id = makeId();
    seen.add(id);
    return { ...item, id };
  });
}

function cleanScale(raw: Record<string, unknown>) {
  const min = asInt(raw.min, 1, ASSIGNMENT_LIMITS.scaleMin, ASSIGNMENT_LIMITS.scaleMax - 1);
  const max = asInt(raw.max, 5, min + 1, ASSIGNMENT_LIMITS.scaleMax);
  return {
    min,
    max,
    minLabel: asString(raw.minLabel, ASSIGNMENT_LIMITS.option),
    maxLabel: asString(raw.maxLabel, ASSIGNMENT_LIMITS.option),
    explanation: asString(raw.explanation, ASSIGNMENT_LIMITS.intro),
  };
}

function cleanField(raw: unknown, makeId: () => string): AssignmentField | null {
  if (!isObject(raw)) return null;
  const type = FIELD_TYPES.includes(raw.type as FieldType) ? (raw.type as FieldType) : null;
  if (!type) return null;
  const base = {
    id: asId(raw.id, makeId),
    label: asString(raw.label, ASSIGNMENT_LIMITS.label),
    help: asString(raw.help, ASSIGNMENT_LIMITS.help),
    required: raw.required === true,
  };
  switch (type) {
    case "short":
    case "long":
    case "video_link":
      return { ...base, type };
    case "single":
    case "multi": {
      const options = (Array.isArray(raw.options) ? raw.options : [])
        .map((o) => asString(o, ASSIGNMENT_LIMITS.option))
        .filter(Boolean);
      return { ...base, type, options: [...new Set(options)].slice(0, ASSIGNMENT_LIMITS.options), allowComment: raw.allowComment === true };
    }
    case "scale":
      return { ...base, type, ...cleanScale(raw) };
    case "scale_rows": {
      const rows: ScaleRow[] = (Array.isArray(raw.rows) ? raw.rows : [])
        .filter(isObject)
        .map((r) => ({ id: asId(r.id, makeId), label: asString(r.label, ASSIGNMENT_LIMITS.option) }))
        .filter((r) => r.label)
        .slice(0, ASSIGNMENT_LIMITS.rows);
      return { ...base, type, ...cleanScale(raw), rows: uniqueIds(rows, new Set(), makeId), mode: raw.mode === "text" ? "text" : "score" };
    }
    case "upload": {
      const accept = (Array.isArray(raw.accept) ? raw.accept : []).filter((k): k is UploadKind => ALL_UPLOAD_KINDS.includes(k as UploadKind));
      return {
        ...base,
        type,
        accept: accept.length ? ALL_UPLOAD_KINDS.filter((k) => accept.includes(k)) : ["pdf"],
        maxFiles: asInt(raw.maxFiles, 1, 1, ASSIGNMENT_LIMITS.maxFiles),
      };
    }
  }
}

/**
 * The assignment as the lesson editor sends it (JSON), cleaned up: unknown
 * keys and field types dropped, texts trimmed and capped, ids checked and
 * unique, numbers in range. The block id always stays the current one.
 */
export function cleanAssignment(raw: unknown, blockId: string, makeId: () => string): AssignmentBlock {
  const source = isObject(raw) ? raw : {};
  const seen = new Set<string>([blockId]);
  const parts = (Array.isArray(source.parts) ? source.parts : [])
    .filter(isObject)
    .slice(0, ASSIGNMENT_LIMITS.parts)
    .map((p) => ({
      id: asId(p.id, makeId),
      title: asString(p.title, ASSIGNMENT_LIMITS.title),
      intro: asString(p.intro, ASSIGNMENT_LIMITS.intro),
      fields: (Array.isArray(p.fields) ? p.fields : [])
        .slice(0, ASSIGNMENT_LIMITS.fieldsPerPart)
        .map((f) => cleanField(f, makeId))
        .filter((f): f is AssignmentField => f !== null),
    }));
  const uniqueParts = uniqueIds(parts, seen, makeId).map((p) => ({ ...p, fields: uniqueIds(p.fields, seen, makeId) }));
  const repeatOf = typeof source.repeatOf === "string" && ID.test(source.repeatOf) && source.repeatOf !== blockId ? source.repeatOf : null;
  return {
    id: blockId,
    type: "assignment",
    title: asString(source.title, ASSIGNMENT_LIMITS.title),
    intro: asString(source.intro, ASSIGNMENT_LIMITS.intro),
    requiredForLesson: source.requiredForLesson === true,
    feedbackAllowed: source.feedbackAllowed === true,
    graded: source.graded === true,
    repeatOf,
    parts: uniqueParts,
  };
}

/**
 * The answers as the student's browser sends them, cleaned up against the
 * assignment: only known fields, values that fit the field. Files are never
 * taken from the browser: an upload field keeps the files already in the
 * draft, minus the ones the student removed (files only arrive through the
 * upload action).
 */
export function cleanAnswers(assignment: AssignmentBlock, raw: unknown, previous: AssignmentAnswers): AssignmentAnswers {
  const input = isObject(raw) ? raw : {};
  const out: AssignmentAnswers = {};
  for (const field of allFields(assignment)) {
    // Untouched and never answered: stays out of the draft.
    if (!(field.id in input) && !(field.id in previous)) continue;
    const value = isObject(input[field.id]) ? (input[field.id] as Record<string, unknown>) : {};
    const before = previous[field.id] ?? {};
    const answer = cleanFieldAnswer(field, value, before);
    if (answer) out[field.id] = answer;
  }
  // Answers to fields the owner has removed since stay in the draft: nothing typed is ever thrown away.
  for (const [id, value] of Object.entries(previous)) if (!(id in out) && !allFields(assignment).some((f) => f.id === id)) out[id] = value;
  return out;
}

function cleanFieldAnswer(field: AssignmentField, value: Record<string, unknown>, before: FieldAnswer): FieldAnswer | null {
  const rawText = (key: string, max: number) => (typeof value[key] === "string" ? (value[key] as string).slice(0, max) : undefined);
  switch (field.type) {
    case "short":
    case "long": {
      const text = rawText("text", field.type === "short" ? ASSIGNMENT_LIMITS.shortAnswer : ASSIGNMENT_LIMITS.answer);
      return text === undefined ? (before.text !== undefined ? { text: before.text } : null) : { text };
    }
    case "video_link": {
      // Kept as typed (also a half-pasted link in a draft); submitting checks that it is a YouTube or Vimeo link.
      const url = rawText("url", ASSIGNMENT_LIMITS.url)?.trim();
      return url === undefined ? (before.url !== undefined ? { url: before.url } : null) : { url };
    }
    case "single":
    case "multi": {
      const comment = field.allowComment ? rawText("comment", ASSIGNMENT_LIMITS.comment) : undefined;
      const extra = comment !== undefined ? { comment } : before.comment !== undefined ? { comment: before.comment } : {};
      if (field.type === "single") {
        // An earlier choice the owner has since reworded stays until the student picks again.
        const choice = typeof value.choice === "string" && field.options.includes(value.choice) ? value.choice : value.choice === null ? null : before.choice ?? null;
        return { choice, ...extra };
      }
      const choices = Array.isArray(value.choices)
        ? field.options.filter((o) => (value.choices as unknown[]).includes(o))
        : before.choices ?? [];
      return { choices, ...extra };
    }
    case "scale": {
      const score = typeof value.score === "number" && Number.isInteger(value.score) && value.score >= field.min && value.score <= field.max
        ? value.score
        : value.score === null ? null : before.score ?? null;
      return { score };
    }
    case "scale_rows": {
      const input = isObject(value.rows) ? value.rows : {};
      const rows: Record<string, number | string> = { ...(before.rows ?? {}) };
      for (const row of field.rows) {
        if (!(row.id in input)) continue;
        const v = input[row.id];
        if (field.mode === "score") {
          if (typeof v === "number" && Number.isInteger(v) && v >= field.min && v <= field.max) rows[row.id] = v;
          else if (v === null || v === "") delete rows[row.id];
        } else if (typeof v === "string") {
          rows[row.id] = v.slice(0, ASSIGNMENT_LIMITS.rowText);
        }
      }
      return { rows };
    }
    case "upload": {
      const files = before.files ?? [];
      if (!Array.isArray(value.keep)) return { files };
      const keep = new Set(value.keep.filter((x): x is string => typeof x === "string"));
      return { files: files.filter((f) => keep.has(f.id)) };
    }
  }
}

// Required fields -------------------------------------------------------------------

export function isFieldAnswered(field: AssignmentField, answer: FieldAnswer | undefined): boolean {
  if (!answer) return false;
  switch (field.type) {
    case "short":
    case "long":
      return (answer.text ?? "").trim().length > 0;
    case "single":
      return !!answer.choice;
    case "multi":
      return (answer.choices ?? []).length > 0;
    case "scale":
      return typeof answer.score === "number";
    case "scale_rows":
      return field.rows.length > 0 && field.rows.every((r) => {
        const v = answer.rows?.[r.id];
        return typeof v === "number" || (typeof v === "string" && v.trim().length > 0);
      });
    case "upload":
      return (answer.files ?? []).length > 0;
    case "video_link":
      return videoEmbed(answer.url ?? "") !== null;
  }
}

/** Required fields without an answer: submitting waits for these, saving a draft never does. */
export const missingRequiredFields = (assignment: AssignmentBlock, answers: AssignmentAnswers): AssignmentField[] =>
  allFields(assignment).filter((f) => (f.required && !isFieldAnswered(f, answers[f.id])) || invalidVideoLink(f, answers[f.id]));

/** A video link that was filled in but is not a YouTube or Vimeo link (also blocks submitting an optional field). */
export const invalidVideoLink = (field: AssignmentField, answer: FieldAnswer | undefined) =>
  field.type === "video_link" && !!answer?.url?.trim() && videoEmbed(answer.url) === null;

/** Answered fields out of all fields, for "3 van 5 ingevuld". */
export function answeredCount(assignment: AssignmentBlock, answers: AssignmentAnswers) {
  const fields = allFields(assignment);
  return { answered: fields.filter((f) => isFieldAnswered(f, answers[f.id])).length, total: fields.length };
}

/** Every file in a set of answers. */
export const filesIn = (answers: AssignmentAnswers): FileRef[] => Object.values(answers).flatMap((a) => a.files ?? []);

/** Same answers (to tell "changes not yet submitted"). Key order does not matter. */
export function sameAnswers(a: AssignmentAnswers, b: AssignmentAnswers): boolean {
  const norm = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(norm) : isObject(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])])) : x;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// Feedback limit -------------------------------------------------------------------

/**
 * May the student ask for feedback on this assignment? `others` is the number
 * of other assignments in the same module that already have a request (also
 * one in a draft). The server checks this in a transaction.
 */
export const feedbackRequestAllowed = (others: number, limit = FEEDBACK_LIMIT) => others < limit;

// Lesson completion ------------------------------------------------------------------

export const assignmentsOf = (blocks: Block[]): AssignmentBlock[] => blocks.filter((b): b is AssignmentBlock => b.type === "assignment");

/**
 * A lesson with assignments marked "verplicht voor afronding" completes when
 * all of them are submitted; a lesson without completes when the student
 * marks it as read.
 */
export function lessonCompletion(blocks: Block[], submissions: Pick<Submission, "blockId" | "status">[]) {
  const required = assignmentsOf(blocks).filter((a) => a.requiredForLesson);
  const submitted = new Set(submissions.filter((s) => isSubmitted(s.status)).map((s) => s.blockId));
  const open = required.filter((a) => !submitted.has(a.id));
  return { required, open, byAssignments: required.length > 0, complete: required.length > 0 && open.length === 0 };
}

// Repeated scan ----------------------------------------------------------------------

export interface ScanRowComparison {
  label: string;
  before: number | string | null;
  after: number | string | null;
  /** after - before for two scores, otherwise null. */
  change: number | null;
}

export interface ScanComparison {
  fieldId: string;
  label: string;
  min: number;
  max: number;
  rows: ScanRowComparison[];
}

type Measured = { assignment: AssignmentBlock; answers: AssignmentAnswers };

const scaleFields = (a: AssignmentBlock) => allFields(a).filter((f) => f.type === "scale" || f.type === "scale_rows");
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Puts the first and the repeated measurement side by side: per scale field of
 * the repeat, matched to the original by id or else by position, and per row
 * by id or else by label (the repeat may be a copy with new ids).
 */
export function compareScans(first: Measured | null, repeat: Measured): ScanComparison[] {
  const originals = first ? scaleFields(first.assignment) : [];
  return scaleFields(repeat.assignment).map((field, i) => {
    const original = originals.find((f) => f.id === field.id) ?? originals[i];
    const beforeAnswer = original && first ? first.answers[original.id] : undefined;
    const afterAnswer = repeat.answers[field.id];
    const value = (f: AssignmentField | undefined, a: FieldAnswer | undefined, rowLabel?: string, rowId?: string) => {
      if (!f || !a) return null;
      if (f.type === "scale") return typeof a.score === "number" ? a.score : null;
      if (f.type !== "scale_rows") return null;
      const row = f.rows.find((r) => r.id === rowId) ?? f.rows.find((r) => rowLabel !== undefined && norm(r.label) === norm(rowLabel));
      const v = row ? a.rows?.[row.id] : undefined;
      return v === undefined || v === "" ? null : v;
    };
    const rows: ScanRowComparison[] =
      field.type === "scale"
        ? [{ label: field.label, before: value(original, beforeAnswer), after: value(field, afterAnswer), change: null }]
        : (field as Extract<AssignmentField, { type: "scale_rows" }>).rows.map((row) => ({
            label: row.label,
            before: value(original, beforeAnswer, row.label, row.id),
            after: value(field, afterAnswer, row.label, row.id),
            change: null,
          }));
    for (const r of rows) r.change = typeof r.before === "number" && typeof r.after === "number" ? r.after - r.before : null;
    const scale = field as { min: number; max: number };
    return { fieldId: field.id, label: field.label, min: scale.min, max: scale.max, rows };
  });
}

// Legacy blocks (before migration 0025) ------------------------------------------------

/** Same output as public.wpa_legacy_assignment in migration 0025 (a DB test compares them). */
export function legacyToAssignment(block: LegacyBlock): AssignmentBlock {
  const base = { id: `${block.id}-f1`, label: block.prompt ?? "", help: block.helpText ?? "", required: block.required === true };
  const field: AssignmentField =
    block.type === "choice"
      ? { ...base, type: "single", options: block.options ?? [], allowComment: false }
      : block.type === "upload"
        ? { ...base, type: "upload", accept: ["pdf", "docx", "xlsx", "pptx", "jpg", "png"], maxFiles: 10 }
        : { ...base, type: "long" };
  return {
    id: block.id,
    type: "assignment",
    title: "",
    intro: "",
    requiredForLesson: block.required === true,
    feedbackAllowed: block.feedback === true,
    graded: false,
    repeatOf: null,
    parts: [{ id: `${block.id}-p1`, title: "", intro: "", fields: [field] }],
  };
}

const isLegacy = (block: StoredBlock): block is LegacyBlock =>
  block.type === "question" || block.type === "choice" || block.type === "upload";

/**
 * Upload kinds that no longer exist (video files, "mp4", before videos became
 * links) are dropped from a stored assignment; an upload field left without
 * any kind accepts pdf, as cleanAssignment does.
 */
export function withKnownUploadKinds(assignment: AssignmentBlock): AssignmentBlock {
  const stale = (f: AssignmentField) => f.type === "upload" && (!Array.isArray(f.accept) || f.accept.some((k) => !ALL_UPLOAD_KINDS.includes(k)));
  if (!assignment.parts?.some((p) => p.fields?.some(stale))) return assignment;
  return {
    ...assignment,
    parts: assignment.parts.map((p) => ({
      ...p,
      fields: p.fields.map((f) => {
        if (!stale(f) || f.type !== "upload") return f;
        const accept = (Array.isArray(f.accept) ? f.accept : []).filter((k) => ALL_UPLOAD_KINDS.includes(k));
        return { ...f, accept: accept.length ? accept : (["pdf"] as UploadKind[]) };
      }),
    })),
  };
}

/** Lesson blocks as stored to the blocks the app works with: legacy answer blocks become assignments, stale upload kinds go. */
export const normaliseBlocks = (blocks: StoredBlock[]): Block[] =>
  (Array.isArray(blocks) ? blocks : []).map((b) => (isLegacy(b) ? legacyToAssignment(b) : b.type === "assignment" ? withKnownUploadKinds(b) : b));

// Plain text --------------------------------------------------------------------------

export interface AnswerLine {
  part: string;
  question: string;
  required: boolean;
  answer: string;
  files: FileRef[];
}

/** One line per field with the answer as text: for the MCP tools, exports and mails. */
export function answersAsText(assignment: AssignmentBlock, answers: AssignmentAnswers): AnswerLine[] {
  return assignment.parts.flatMap((part) =>
    part.fields.map((field) => {
      const a = answers[field.id] ?? {};
      let answer = "";
      switch (field.type) {
        case "short":
        case "long":
          answer = a.text ?? "";
          break;
        case "single":
          answer = [a.choice ?? "", a.comment ? `Toelichting: ${a.comment}` : ""].filter(Boolean).join("\n");
          break;
        case "multi":
          answer = [(a.choices ?? []).join(", "), a.comment ? `Toelichting: ${a.comment}` : ""].filter(Boolean).join("\n");
          break;
        case "scale":
          answer = typeof a.score === "number" ? `${a.score} (schaal ${field.min}-${field.max})` : "";
          break;
        case "scale_rows":
          answer = field.rows.map((r) => `${r.label}: ${a.rows?.[r.id] ?? "-"}`).join("\n");
          break;
        case "upload":
          answer = (a.files ?? []).map((f) => f.name).join(", ");
          break;
        case "video_link":
          answer = a.url ?? "";
          break;
      }
      return { part: part.title, question: field.label, required: field.required, answer, files: a.files ?? [] };
    }),
  );
}

/** A short name for an assignment: its title, or else its first question. */
export const assignmentTitle = (a: AssignmentBlock) => a.title || allFields(a)[0]?.label?.slice(0, 120) || "Opdracht";
