import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { canViewPortfolio } from "@/lib/domain/privacy";
import { portfolioZip, zipResponse } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * The whole portfolio as a zip (portfolio.html plus the folder bestanden).
 * A student always gets their own, whatever ?cursist= says; Sabine passes
 * ?cursist=<user id> for any student.
 */
export async function GET(request: Request) {
  const viewer = await currentUser();
  if (!viewer) return new Response("Niet ingelogd", { status: 401 });
  const asked = new URL(request.url).searchParams.get("cursist");
  const studentId = viewer.role === "owner" ? (asked ?? "") : viewer.id;
  if (!canViewPortfolio(viewer, studentId)) return new Response("Geen toegang", { status: 403 });
  const student = await getStore().getUser(studentId);
  if (!student || student.role !== "student") return new Response("Niet gevonden", { status: 404 });
  const { data, fileName } = await portfolioZip(student, viewer.role === "owner" ? "owner" : "student");
  return zipResponse(data, fileName);
}
