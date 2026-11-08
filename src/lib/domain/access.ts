import type { Enrollment } from "@/lib/data/types";

export type AccessStatus = "active" | "paused" | "expired" | "revoked";

/** Standard term of access for a new student (Academy 12). */
export const ACCESS_MONTHS = 12;

/** Terms Sabine can choose when she adds a student; 12 months is the default. */
export const ACCESS_TERM_MONTHS = [3, 6, 12, 18, 24] as const;

/** The term from the form; anything unknown falls back to the standard 12 months. */
export function accessTermMonths(input: unknown): number {
  const n = Number(input);
  return (ACCESS_TERM_MONTHS as readonly number[]).includes(n) ? n : ACCESS_MONTHS;
}

/** Choices for "Verlengen", the same on the overview and on the student page. */
export const EXTEND_MONTHS = [1, 2, 3, 6, 12] as const;
export const DEFAULT_EXTEND_MONTHS = 1;

export function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  // Clamp 31 jan + 1 month to the end of february instead of rolling into march.
  if (date.getUTCDate() < day) date.setUTCDate(0);
  return date.toISOString();
}

export function accessStatus(enrollment: Enrollment, now = new Date()): AccessStatus {
  if (enrollment.revokedAt) return "revoked";
  if (enrollment.pausedAt) return "paused";
  if (now.getTime() >= new Date(enrollment.endsAt).getTime()) return "expired";
  return "active";
}

export const hasLessonAccess = (enrollment: Enrollment | null, now = new Date()) =>
  !!enrollment && accessStatus(enrollment, now) === "active";

/** Pausing freezes the remaining time; the end date moves when it resumes. */
export function pause(enrollment: Enrollment, now = new Date()): Partial<Enrollment> {
  if (enrollment.pausedAt) throw new Error("Toegang is al gepauzeerd.");
  if (accessStatus(enrollment, now) !== "active") {
    throw new Error("Alleen actieve toegang kan worden gepauzeerd.");
  }
  const at = now.toISOString();
  return { pausedAt: at, pauses: [...enrollment.pauses, { pausedAt: at, resumedAt: null }] };
}

export function resume(enrollment: Enrollment, now = new Date()): Partial<Enrollment> {
  if (!enrollment.pausedAt) throw new Error("Toegang is niet gepauzeerd.");
  const pausedMs = Math.max(0, now.getTime() - new Date(enrollment.pausedAt).getTime());
  const endsAt = new Date(new Date(enrollment.endsAt).getTime() + pausedMs).toISOString();
  const pauses = enrollment.pauses.map((p) =>
    p.resumedAt === null ? { ...p, resumedAt: now.toISOString() } : p,
  );
  return { pausedAt: null, endsAt, pauses };
}

/** Days of access left; while paused this stays frozen. */
export function remainingDays(enrollment: Enrollment, now = new Date()): number {
  const reference = enrollment.pausedAt ? new Date(enrollment.pausedAt) : now;
  const ms = new Date(enrollment.endsAt).getTime() - reference.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export const ACCESS_LABELS: Record<AccessStatus, string> = {
  active: "Actief",
  paused: "Gepauzeerd",
  expired: "Verlopen",
  revoked: "Ingetrokken",
};
