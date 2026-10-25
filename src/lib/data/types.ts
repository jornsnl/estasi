// Domain model of the Academy. These shapes are shared by every storage
// backend (local JSON file now, Supabase later), so keep them plain data.

export type Role = "student" | "owner";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string | null;
  /** One-time token for activating an account or resetting a password. */
  setupToken: string | null;
  setupTokenExpiresAt: string | null;
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
  markdown: string;
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
  | DownloadBlock
  | QuestionBlock
  | ChoiceBlock
  | UploadBlock;

export type BlockType = Block["type"];

export type AnswerableBlock = QuestionBlock | ChoiceBlock | UploadBlock;

export interface Module {
  id: string;
  title: string;
  description: string;
  position: number;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  position: number;
  blocks: Block[];
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
