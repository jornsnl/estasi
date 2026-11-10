import "server-only";
import { overviewFor, studentOverview, type StudentOverview } from "@/lib/academy";
import { getStore, type Enrollment, type PackageType, type User } from "@/lib/data";
import { isUuid } from "@/lib/db";

/**
 * "Bekijk als cursist" (feedback Sabine): the student pages seen from the
 * beheer, without signing in as a student. Either as a made up new student of
 * package A or B (nothing done yet, the first module open), or as one real
 * student with her own progress and answers. Only reads, never writes: no
 * activity, no "feedback seen", no answers saved.
 */
export interface PreviewTarget {
  /** The query string that keeps this choice on the links: "pakket=B" or "cursist=<id>". */
  query: string;
  student: User | null;
  pkg: PackageType;
  o: StudentOverview;
}

// A fixed id that is never a real account, so nothing in the database belongs to it.
const PREVIEW_ID = "00000000-0000-4000-8000-00000000f00d";

function madeUpStudent(pkg: PackageType): { user: User; enrollment: Enrollment } {
  const now = new Date();
  const year = new Date(now);
  year.setFullYear(year.getFullYear() + 1);
  return {
    user: { id: PREVIEW_ID, email: "", name: "Nieuwe cursist", role: "student", activatedAt: now.toISOString(), createdAt: now.toISOString(), lastActiveAt: null },
    enrollment: {
      id: PREVIEW_ID,
      userId: PREVIEW_ID,
      package: pkg,
      purchasedAt: now.toISOString(),
      endsAt: year.toISOString(),
      pausedAt: null,
      pauses: [],
      revokedAt: null,
      onlineCompletedAt: null,
      certificateReleasedAt: null,
      certificateCode: null,
      practicalStatus: "none",
      practicalCertificateReleasedAt: null,
      practicalCertificateCode: null,
      ownerNotes: "",
    },
  };
}

type Params = Record<string, string | string[] | undefined>;
const param = (p: Params, key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");

export async function previewTarget(params: Params): Promise<PreviewTarget> {
  // "wie" comes from the choice in the bar: "pakket-A", "pakket-B" or the id of a student.
  const who = param(params, "wie");
  const id = param(params, "cursist") || who;
  if (isUuid(id)) {
    const student = await getStore().getUser(id);
    if (student?.role === "student") {
      const o = await studentOverview(student);
      return { query: `cursist=${student.id}`, student, pkg: o.enrollment?.package ?? "A", o };
    }
  }
  const pkg: PackageType = (param(params, "pakket") || who.replace(/^pakket-/, "")) === "A" ? "A" : "B";
  const { user, enrollment } = madeUpStudent(pkg);
  return { query: `pakket=${pkg}`, student: null, pkg, o: await overviewFor(user, enrollment) };
}

/** The students to choose from in the bar, by name. */
export async function previewStudents(): Promise<User[]> {
  return (await getStore().listUsers("student")).sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

/** The links of the student pages, kept inside the preview. */
export const previewLinks = (query: string) => ({
  lesson: (id: string) => `/beheer/voorbeeld/les/${id}?${query}`,
  course: `/beheer/voorbeeld/opleiding?${query}`,
  // The draaiboek and the certificate have their own views in the beheer.
  draaiboek: (_accessId: string, coupleId: string) => `/k/${coupleId}/draaiboek`,
  certificate: "/beheer/certificaat",
});
