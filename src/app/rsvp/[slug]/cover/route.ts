import { one } from "@/lib/ws/db";
import { FILE_COLUMNS, fileResponse } from "@/lib/ws/files";
import { publicForm } from "@/lib/ws/rsvp";

/** The header of a public RSVP page: the form's own photo, else the couple's cover (only while the form is open). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const found = await publicForm((await params).slug);
  const fileId = found?.form.header_file_id ?? found?.couple.cover_file_id;
  if (!found || !fileId) return new Response("Niet gevonden", { status: 404 });
  const file = await one<{ name: string; mime: string; size: number; storage_path: string | null; data: Buffer | null }>(
    `select ${FILE_COLUMNS} from files f where f.id = $1 and f.couple_id = $2 and f.status = 'ready'`,
    [fileId, found.couple.id],
  );
  if (!file) return new Response("Niet gevonden", { status: 404 });
  return fileResponse(file, { cache: "public", onlyImages: true });
}
