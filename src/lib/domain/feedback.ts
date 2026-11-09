// Rules around personal feedback, the assessment of final assignments and the
// certificates (Academy 8, 9 en 15). Pure functions, used by the server
// actions, the pages, the MCP tools and the tests.

import type { Assessment, Enrollment, FeedbackStatus, SubmissionStatus } from "@/lib/data/types";
import { FEEDBACK_LIMIT } from "./assignment";

export const FEEDBACK_STATUSES: FeedbackStatus[] = ["nieuw", "in_behandeling", "afgerond"];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  nieuw: "Nieuw",
  in_behandeling: "Bezig met nakijken",
  afgerond: "Klaar",
};

/**
 * On Sabine's Taken page (feedback): a request stays until it is "Klaar" and
 * feedback has actually been sent. "Klaar" without sent feedback stays, so
 * nothing is forgotten.
 */
export const stillOnTaskPage = (r: { feedbackStatus: FeedbackStatus; lastSentAt: string | null }) => !(r.feedbackStatus === "afgerond" && r.lastSentAt);

export const ASSESSMENT_LABELS: Record<Assessment, string> = {
  voldoende: "Voldoende",
  verbetering_nodig: "Verbetering nodig",
};

export const isAssessment = (value: unknown): value is Assessment => value === "voldoende" || value === "verbetering_nodig";

export const isFeedbackStatus = (value: unknown): value is FeedbackStatus => FEEDBACK_STATUSES.includes(value as FeedbackStatus);

/** Waits for the owner (shown in the counter of the admin menu). */
export const isOpenFeedback = (status: FeedbackStatus | null | undefined) => status === "nieuw" || status === "in_behandeling";

// Requests per module -------------------------------------------------------------

/**
 * The student's feedback requests in one module, seen from one assignment.
 * `others`: other assignments in the module with a request (in a draft or a
 * handed-in version); `thisUses`: this assignment has one (checked in the
 * draft, or asked for with an earlier version).
 */
export function feedbackSlots(others: number, thisUses: boolean, limit = FEEDBACK_LIMIT) {
  const used = Math.min(limit, others + (thisUses ? 1 : 0));
  return {
    used,
    left: Math.max(0, limit - used),
    limit,
    /** No request possible here: the limit is reached by other assignments. */
    blocked: !thisUses && others >= limit,
  };
}

/** "Je hebt in deze module nog 1 van 2 feedbackverzoeken." */
export const slotsText = (left: number, limit = FEEDBACK_LIMIT) =>
  `Je hebt in deze module nog ${left} van ${limit} feedbackverzoeken.`;

// Status of a request -------------------------------------------------------------

export type FeedbackEvent =
  /** The owner saved a concept. */
  | { type: "concept" }
  /** The owner sent the feedback (and possibly an assessment). */
  | { type: "sent" }
  /** The student handed in a version (requested: with a feedback request; graded: final assignment). */
  | { type: "submitted"; requested: boolean; graded: boolean }
  /** The owner set the status by hand. */
  | { type: "manual"; status: FeedbackStatus };

/**
 * The feedback status of a version after an event. Null means the version
 * waits for nothing (no request, no final assignment) and stays so: a concept
 * or sent feedback on such a version does not make it a request.
 */
export function nextFeedbackStatus(current: FeedbackStatus | null, event: FeedbackEvent): FeedbackStatus | null {
  switch (event.type) {
    case "submitted":
      return event.requested || event.graded ? "nieuw" : null;
    case "concept":
      return current === null ? null : current === "afgerond" ? "afgerond" : "in_behandeling";
    case "sent":
      return current === null ? null : "afgerond";
    case "manual":
      return current === null ? null : event.status;
  }
}

/**
 * Whether an assessment may be given on a version: only a final assignment,
 * only its latest version and only once the student handed it in.
 */
export function assessmentProblem(input: { graded: boolean; isLatest: boolean; status: SubmissionStatus }): string | null {
  if (!input.graded) return "Alleen een eindopdracht krijgt een beoordeling.";
  if (input.status === "concept") return "Deze opdracht is nog niet ingediend.";
  if (!input.isLatest) return "De cursist heeft intussen een nieuwere versie ingeleverd. Beoordeel die versie.";
  return null;
}

// Certificates -------------------------------------------------------------------

export interface ReadinessModule {
  title: string;
  lessonsTotal: number;
  lessonsCompleted: number;
}

export interface ReadinessGraded {
  title: string;
  lesson: string;
  /** Null when the student has not started it. */
  status: SubmissionStatus | null;
}

/**
 * Can the certificate of the online part be released? All visible modules of
 * the student's package completed, every final assignment (graded) assessed
 * as voldoende, and the owner confirmed the online part. `missing` says in
 * plain Dutch what is still open.
 */
export function onlineCertificateReadiness(input: {
  modules: ReadinessModule[];
  graded: ReadinessGraded[];
  onlineConfirmed: boolean;
}): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (input.modules.length === 0) missing.push("Er staan nog geen modules in het pakket van deze cursist.");
  for (const m of input.modules) {
    const open = m.lessonsTotal - m.lessonsCompleted;
    if (m.lessonsTotal === 0 || open <= 0) continue;
    missing.push(`Module "${m.title}": nog ${open} van ${m.lessonsTotal} ${m.lessonsTotal === 1 ? "les" : "lessen"} niet afgerond.`);
  }
  for (const g of input.graded) {
    const where = `Eindopdracht "${g.title}" (${g.lesson})`;
    if (!g.status || g.status === "concept") missing.push(`${where} is nog niet ingediend.`);
    else if (g.status === "ingediend") missing.push(`${where} is ingediend maar nog niet beoordeeld.`);
    else if (g.status === "verbetering_nodig") missing.push(`${where}: verbetering nodig, wacht op een aangepaste versie.`);
  }
  if (!input.onlineConfirmed) missing.push("Bevestig eerst de online afronding.");
  return { ready: missing.length === 0, missing };
}

/** Can the practical certificate be released? Package B and the shadow wedding completed. */
export function practicalCertificateReadiness(enrollment: Pick<Enrollment, "package" | "practicalStatus">): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (enrollment.package !== "B") missing.push("Het praktijkcertificaat hoort bij pakket B.");
  else if (enrollment.practicalStatus !== "completed") missing.push("Zet eerst het praktijkdeel (de meeloopbruiloft) op afgerond.");
  return { ready: missing.length === 0, missing };
}

/** Certificate numbers: WPA-2026-1A2B3C (online) and WPP-2026-1A2B3C (practical). */
export const certificateCode = (kind: "online" | "praktijk", year: number, random: string) =>
  `${kind === "online" ? "WPA" : "WPP"}-${year}-${random.toUpperCase()}`;

// Overview -------------------------------------------------------------------------

export interface RequestFilter {
  /** "open" = nieuw and in behandeling; "alle" = everything. */
  status: FeedbackStatus | "open" | "alle";
  userId?: string;
  moduleId?: string;
}

export function parseRequestFilter(params: Record<string, string | string[] | undefined>): RequestFilter {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const status = one("status");
  return {
    status: status === "alle" || status === "open" || isFeedbackStatus(status) ? (status as RequestFilter["status"]) : "open",
    ...(one("cursist") ? { userId: one("cursist") } : {}),
    ...(one("module") ? { moduleId: one("module") } : {}),
  };
}

export function matchesRequest(item: { feedbackStatus: FeedbackStatus; userId: string; moduleId: string | null }, filter: RequestFilter): boolean {
  if (filter.status === "open" && !isOpenFeedback(item.feedbackStatus)) return false;
  if (filter.status !== "open" && filter.status !== "alle" && item.feedbackStatus !== filter.status) return false;
  if (filter.userId && item.userId !== filter.userId) return false;
  if (filter.moduleId && item.moduleId !== filter.moduleId) return false;
  return true;
}
