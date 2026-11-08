import { currentUser } from "@/lib/auth/session";
import { one } from "@/lib/ws/db";
import { FILE_COLUMNS, fileResponse } from "@/lib/ws/files";
import { checkStudentAccess, printFileOfCouple } from "@/lib/ws/meekijkers";

/**
 * Images in a student's run sheet (feedback 13.5): only while the access is
 * active, and only files that run sheet shows (styling images, the cover).
 * Every other file of the couple stays behind /api/ws-bestanden.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ accessId: string; fileId: string }> }) {
  const account = await currentUser();
  if (!account || account.role !== "student") return new Response("Niet ingelogd", { status: 401 });
  const { accessId, fileId } = await params;
  const access = await checkStudentAccess(account.id, accessId);
  // Same answer for "no access", "missing" and "someone else's", so ids reveal nothing.
  if (!access || !(await printFileOfCouple(access.couple.id, fileId))) return new Response("Niet gevonden", { status: 404 });
  const file = await one<{ name: string; mime: string; size: number; storage_path: string | null; data: Buffer | null }>(
    `select ${FILE_COLUMNS} from files f where f.id = $1 and f.couple_id = $2 and f.status = 'ready'`,
    [fileId, access.couple.id],
  );
  if (!file) return new Response("Niet gevonden", { status: 404 });
  return fileResponse(file, { onlyImages: true });
}
