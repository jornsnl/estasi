import { audit } from "@/lib/academy";
import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { inzageZip } from "@/lib/data/privacy";
import { zipResponse } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/** Sabine only: everything the Academy keeps about one student, as a zip (request for access, AVG). */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const viewer = await currentUser();
  if (!viewer) return new Response("Niet ingelogd", { status: 401 });
  if (viewer.role !== "owner") return new Response("Geen toegang", { status: 403 });
  const student = await getStore().getUser((await params).userId);
  if (!student || student.role !== "student") return new Response("Niet gevonden", { status: 404 });
  const { data, fileName } = await inzageZip(student);
  await audit(viewer, "Gegevens geëxporteerd (inzage)", "", student.id);
  return zipResponse(data, fileName);
}
