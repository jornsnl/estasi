// Domain model of the Academy. Plain data; rows.ts maps it to the tables in
// schema public.

/** "couple": a bridal couple with access to their Your Wedding Space only. */
export type Role = "student" | "owner" | "couple";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** When the account got its first password. Passwords live in Supabase Auth (development: dev_passwords). */
  activatedAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface Profile {
  userId: string;
  phone: string;
  city: string;
  companyName: string;
  photoFileId: string | null;
  instagram: string;
  website: string;
  intro: string;
  goals: string;
  updatedAt: string;
}

export type PackageType = "A" | "B";

export type PracticalStatus = "none" | "planned" | "completed";

export interface PauseRecord {
  pausedAt: string;
  resumedAt: string | null;
}

export interface Enrollment {
  id: string;
  userId: string;
  package: PackageType;
  purchasedAt: string;
  /** Access end date. Shifts forward when a pause ends. */
  endsAt: string;
  pausedAt: string | null;
  pauses: PauseRecord[];
  revokedAt: string | null;
  /** Set by the owner after personally reviewing the online part. */
  onlineCompletedAt: string | null;
  certificateReleasedAt: string | null;
  certificateCode: string | null;
  practicalStatus: PracticalStatus;
  /** Practical certificate (package B, after the shadow wedding), released by hand by the owner. */
  practicalCertificateReleasedAt: string | null;
  practicalCertificateCode: string | null;
  ownerNotes: string;
}

export interface FileRef {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export type QuestionKind = "open" | "reflection" | "practice";

interface BlockBase {
  id: string;
}

export interface VideoBlock extends BlockBase {
  type: "video";
  url: string;
  caption: string;
}

export interface TextBlock extends BlockBase {
  type: "text";
  /** Older text blocks: Markdown. Shown as long as there is no html. */
  markdown: string;
  /**
   * Text from the lesson editor (TipTap): HTML, sanitised on the server when
   * saved and again when shown (src/lib/domain/html.ts).
   */
  html?: string;
}

/** A picture on its own, uploaded through FileStorage (course material). */
export interface ImageBlock extends BlockBase {
  type: "image";
  file: FileRef | null;
  alt: string;
  caption: string;
}

export interface DownloadBlock extends BlockBase {
  type: "download";
  label: string;
  description: string;
  /** Either an external link or an uploaded file. */
  url: string;
  file: FileRef | null;
}

// Legacy answer blocks (before migration 0025). Migration 0025 turned every one
// of them into an assignment block with one field and the same block id; they
// stay here to read old lesson data (normaliseBlocks in domain/assignment.ts).

export interface LegacyQuestionBlock extends BlockBase {
  type: "question";
  kind: QuestionKind;
  prompt: string;
  helpText: string;
  required: boolean;
  /** Larger assignment: the owner gives written feedback on it. */
  feedback: boolean;
}

export interface LegacyChoiceBlock extends BlockBase {
  type: "choice";
  prompt: string;
  helpText: string;
  options: string[];
  required: boolean;
  feedback: boolean;
}

export interface LegacyUploadBlock extends BlockBase {
  type: "upload";
  prompt: string;
  helpText: string;
  required: boolean;
  feedback: boolean;
}

export type LegacyBlock = LegacyQuestionBlock | LegacyChoiceBlock | LegacyUploadBlock;

// Assignments ----------------------------------------------------------------

/** File types a student may upload in an upload field. */
/** No video files: a video is handed in as a YouTube or Vimeo link (field type video_link). */
export type UploadKind = "pdf" | "docx" | "xlsx" | "pptx" | "jpg" | "png" | "audio";

export type FieldType = "short" | "long" | "single" | "multi" | "scale" | "scale_rows" | "upload" | "video_link";

interface FieldBase {
  id: string;
  /** The question or instruction. */
  label: string;
  help: string;
  /** Needed to submit the assignment (saving a draft is always possible). */
  required: boolean;
}

export interface ShortField extends FieldBase {
  type: "short";
}

export interface LongField extends FieldBase {
  type: "long";
}

export interface ChoiceField extends FieldBase {
  type: "single" | "multi";
  options: string[];
  /** Extra text box for an explanation below the options. */
  allowComment: boolean;
}

export interface ScaleSettings {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  /** Explanation of the scores, shown above the scale. */
  explanation: string;
}

export interface ScaleField extends FieldBase, ScaleSettings {
  type: "scale";
}

export interface ScaleRow {
  id: string;
  label: string;
}

/** Pre-filled rows (topics, competences); per row a score on the scale or a text. */
export interface ScaleRowsField extends FieldBase, ScaleSettings {
  type: "scale_rows";
  rows: ScaleRow[];
  mode: "score" | "text";
}

export interface UploadField extends FieldBase {
  type: "upload";
  accept: UploadKind[];
  maxFiles: number;
}

/** A YouTube or Vimeo link the student pastes; shown embedded. */
export interface VideoLinkField extends FieldBase {
  type: "video_link";
}

export type AssignmentField = ShortField | LongField | ChoiceField | ScaleField | ScaleRowsField | UploadField | VideoLinkField;

export interface AssignmentPart {
  id: string;
  /** Heading, for example "Onderdeel 1: beantwoord drie vragen". May be empty for a one-part assignment. */
  title: string;
  intro: string;
  fields: AssignmentField[];
}

export interface AssignmentBlock extends BlockBase {
  type: "assignment";
  title: string;
  intro: string;
  /** The lesson only counts as completed once this assignment is submitted. */
  requiredForLesson: boolean;
  /** The student may ask for personal feedback on it (Academy 8). */
  feedbackAllowed: boolean;
  /** Final assignment: assessed as "voldoende" or "verbetering nodig". */
  graded: boolean;
  /** Repeat of an earlier assignment (its block id), e.g. the closing competence scan. */
  repeatOf: string | null;
  parts: AssignmentPart[];
}

/** The answer to one field. Which keys are used depends on the field type. */
export interface FieldAnswer {
  text?: string;
  choice?: string | null;
  choices?: string[];
  comment?: string;
  score?: number | null;
  /** scale_rows: per row id a score (mode score) or a text (mode text). */
  rows?: Record<string, number | string>;
  files?: FileRef[];
  /** video_link: the YouTube or Vimeo link as the student pasted it. */
  url?: string;
}

/** Answers per field id. */
export type AssignmentAnswers = Record<string, FieldAnswer>;

export type SubmissionStatus = "concept" | "ingediend" | "verbetering_nodig" | "voldoende";

export interface Submission {
  id: string;
  userId: string;
  lessonId: string;
  blockId: string;
  status: SubmissionStatus;
  draft: AssignmentAnswers;
  /** Optimistic locking: every save of the draft increments it. */
  draftVersion: number;
  feedbackRequested: boolean;
  questionForSabine: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FeedbackStatus = "nieuw" | "in_behandeling" | "afgerond";

/** Assessment of a final assignment (graded). */
export type Assessment = Extract<SubmissionStatus, "voldoende" | "verbetering_nodig">;

/** A fixed copy made at every submit: answers, files and the assignment as it was then. */
export interface SubmissionVersion {
  id: string;
  submissionId: string;
  userId: string;
  version: number;
  answers: AssignmentAnswers;
  assignment: AssignmentBlock;
  feedbackRequested: boolean;
  questionForSabine: string;
  /** Null when no feedback was asked for. */
  feedbackStatus: FeedbackStatus | null;
  submittedAt: string;
}

export interface AssignmentFeedback {
  id: string;
  versionId: string;
  submissionId: string;
  userId: string;
  authorId: string;
  text: string;
  attachment: FileRef | null;
  /** Null while it is a draft only the owner sees. */
  sentAt: string | null;
  /** Assessment of a graded assignment that goes along with this feedback (applied when sent). */
  assessment: Assessment | null;
  /** When the student saw the sent feedback (badge in the Academy). */
  seenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Owner opened a module for one student before the previous one was completed. */
export interface ModuleUnlock {
  userId: string;
  moduleId: string;
  unlockedBy: string;
  unlockedAt: string;
}

export type Block = VideoBlock | TextBlock | ImageBlock | DownloadBlock | AssignmentBlock;

export type BlockType = Block["type"];

/** What lessons.blocks may hold: current blocks and, in old data, legacy ones. */
export type StoredBlock = Block | LegacyBlock;

/** "draft" (concept): only the owner sees it. */
export type ContentStatus = "draft" | "published";

/** For which packages a module is meant: only A, only B or both. */
export type ModulePackages = "A" | "B" | "AB";

export interface Module {
  id: string;
  title: string;
  description: string;
  position: number;
  /** Absent (older data, tests) means published. */
  status?: ContentStatus;
  /** Absent means both packages. */
  packages?: ModulePackages;
}

/** Unpublished changes to a published lesson. */
export interface LessonDraft {
  title: string;
  summary: string;
  blocks: Block[];
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  position: number;
  /** What students see (only when the lesson and its module are published). */
  blocks: Block[];
  /** Absent means published. */
  status?: ContentStatus;
  /** Only on a published lesson: edits that go live with "Publiceren". */
  draft?: LessonDraft | null;
  publishedAt?: string | null;
}

export interface Answer {
  id: string;
  userId: string;
  lessonId: string;
  blockId: string;
  text: string;
  choice: string | null;
  files: FileRef[];
  /** Increments on every change so feedback can point at the version it saw. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Feedback {
  id: string;
  answerId: string;
  userId: string;
  authorId: string;
  text: string;
  attachment: FileRef | null;
  answerVersion: number;
  createdAt: string;
}

export interface LessonCompletion {
  userId: string;
  lessonId: string;
  completedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  targetUserId: string | null;
  action: string;
  details: string;
}

export interface Settings {
  welcomeVideoUrl: string;
  welcomeText: string;
  contactEmail: string;
  practicalSpotsAvailable: boolean;
  practicalSpotsNote: string;
  answersPrivacyNotice: string;
}
