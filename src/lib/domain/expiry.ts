import type { Enrollment } from "@/lib/data/types";
import { accessStatus, remainingDays } from "./access";

/**
 * Notices before access to the Academy ends (Academy 12): a mail 30 and 7
 * days before the end date, each once per end date, and a banner in the
 * Academy during the last 30 days. Pure, so it is covered by unit tests.
 */

/** Days before the end date at which a mail goes out, largest first. */
export const EXPIRY_THRESHOLDS = [30, 7] as const;
export type ExpiryThreshold = (typeof EXPIRY_THRESHOLDS)[number];

/** The banner in the Academy shows from this many days before the end. */
export const BANNER_DAYS = 30;

/** The lazy job runs at most this often. */
export const EXPIRY_JOB_INTERVAL_MS = 60 * 60_000;

/** Days left, only for access that is running now (not paused, revoked or over). */
export function daysLeft(enrollment: Enrollment | null, now = new Date()): number | null {
  if (!enrollment || accessStatus(enrollment, now) !== "active") return null;
  return remainingDays(enrollment, now);
}

export interface NoticeDecision {
  /** The mail to send now, or null. */
  send: ExpiryThreshold | null;
  /** Thresholds to record as done for this end date (also the ones skipped over). */
  record: ExpiryThreshold[];
}

/**
 * Which notice is due. `sent` holds the thresholds already recorded for the
 * current end date. When both are due at once (the 30 day mail was missed,
 * for example because access was set to end in 5 days), only the 7 day mail
 * goes out and both are recorded, so nobody gets two mails on one day.
 */
export function dueNotice(enrollment: Enrollment | null, sent: readonly number[], now = new Date()): NoticeDecision {
  const days = daysLeft(enrollment, now);
  if (days === null || days <= 0) return { send: null, record: [] };
  const due = EXPIRY_THRESHOLDS.filter((t) => days <= t && !sent.includes(t));
  if (due.length === 0) return { send: null, record: [] };
  // The smallest threshold reached is the one that matters now.
  const reached = EXPIRY_THRESHOLDS.filter((t) => days <= t);
  const send = reached[reached.length - 1];
  return { send: sent.includes(send) ? null : send, record: due };
}

/** The banner in the Academy: the number of days left, or null when it does not show. */
export function expiryBanner(enrollment: Enrollment | null, now = new Date()): number | null {
  const days = daysLeft(enrollment, now);
  return days !== null && days <= BANNER_DAYS ? days : null;
}

/** Whether the lazy job may run again. */
export const jobDue = (lastRun: string | Date | null, now = new Date()) =>
  !lastRun || now.getTime() - new Date(lastRun).getTime() >= EXPIRY_JOB_INTERVAL_MS;

/** "nog 1 dag" / "nog 12 dagen" / "vandaag". */
export function daysLeftText(days: number): string {
  if (days <= 0) return "vandaag";
  return days === 1 ? "nog 1 dag" : `nog ${days} dagen`;
}
