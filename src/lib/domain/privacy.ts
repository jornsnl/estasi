import type { Role, User } from "@/lib/data/types";

/**
 * Who may see what of a student (Academy 16). Pure rules, used by the routes
 * and pages and covered by unit tests:
 *   - Sabine (owner) sees everything of every student;
 *   - a student only ever sees their own assignments, portfolio, feedback
 *     and files, whatever id is in the link;
 *   - course material (a file that belongs to no one) only through a lesson
 *     the student can open (checked by the caller, see /api/bestanden).
 */

export interface Viewer {
  id: string;
  role: Role;
}

/** The portfolio (and its export) of studentId. */
export const canViewPortfolio = (viewer: Viewer, studentId: string) =>
  viewer.role === "owner" || (viewer.role === "student" && viewer.id === studentId);

export type FileDecision = "allow" | "deny" | "course";

/**
 * A file from public.files. "course" means: course material, allowed only
 * when a lesson the student can open uses it (the caller checks that).
 */
export function fileAccess(viewer: Viewer, belongsTo: string | null): FileDecision {
  if (viewer.role === "owner") return "allow";
  if (viewer.role !== "student") return "deny";
  if (belongsTo === null) return "course";
  return belongsTo === viewer.id ? "allow" : "deny";
}

/**
 * Deleting a student for good needs two confirmations: the checkbox and the
 * e-mail address typed again (case and spaces do not matter).
 */
export function deletionConfirmed(user: Pick<User, "email">, typedEmail: string, checked: boolean): boolean {
  return checked && typedEmail.trim().toLowerCase() === user.email.trim().toLowerCase() && user.email.trim() !== "";
}

/** A name that is safe as a file name inside a zip (no folders, no odd characters). */
export function safeFileName(name: string, fallback = "bestand"): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Makes every name unique ("plan.pdf", "plan (2).pdf") in the order given. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const name = safeFileName(raw);
    const dot = name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
