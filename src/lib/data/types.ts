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

export interface QuestionBlock extends BlockBase {
  type: "question";
  kind: QuestionKind;
  prompt: string;
  helpText: string;
  required: boolean;
  /** Larger assignment: the owner gives written feedback on it. */
  feedback: boolean;
}

export interface ChoiceBlock extends BlockBase {
  type: "choice";
  prompt: string;
  helpText: string;
  options: string[];
  required: boolean;
  feedback: boolean;
}

export interface UploadBlock extends BlockBase {
  type: "upload";
  prompt: string;
  helpText: string;
  required: boolean;
  feedback: boolean;
}

export type Block =
  | VideoBlock
  | TextBlock
  | ImageBlock
  | DownloadBlock
  | QuestionBlock
  | ChoiceBlock
  | UploadBlock;

export type BlockType = Block["type"];

export type AnswerableBlock = QuestionBlock | ChoiceBlock | UploadBlock;

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
