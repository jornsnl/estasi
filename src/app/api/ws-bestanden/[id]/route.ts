import { currentUser } from "@/lib/auth/session";
import { coupleIdOf } from "@/lib/ws/access";
import { isUuid, one } from "@/lib/ws/db";
import { FILE_COLUMNS, fileResponse } from "@/lib/ws/files";

/** Serves a stored file after checking that the viewer may see that couple's files. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await currentUser();
  if (!account || (account.role !== "owner" && account.role !== "couple")) return new Response("Niet ingelogd", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Niet gevonden", { status: 404 });
  const file = await one<{ couple_id: string | null; name: string; mime: string; size: number; storage_path: string | null; data: Buffer | null }>(
    `select f.couple_id, ${FILE_COLUMNS} from files f where f.id = $1 and f.status = 'ready'`,
    [id],
  );
  // Same answer for "missing" and "someone else's", so ids reveal nothing.
  if (!file) return new Response("Niet gevonden", { status: 404 });
  if (account.role !== "owner") {
    const own = file.couple_id ? file.couple_id === (await coupleIdOf(account.id)) : await isSharedDocument(id);
    if (!own) return new Response("Niet gevonden", { status: 404 });
  }
  return fileResponse(file);
}

/** Files without a couple that every couple may open: fixed documents and Sabine's recommendations. */
async function isSharedDocument(fileId: string) {
  return Boolean(
    await one(
      `select 1 where exists (select 1 from documents where file_id = $1 and couple_id is null)
                   or exists (select 1 from recommendations where (photo_file_id = $1 or brochure_file_id = $1) and not archived)`,
      [fileId],
    ),
  );
}
