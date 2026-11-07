import { currentUser } from "@/lib/auth/session";
import { one } from "@/lib/ws/db";
import { FILE_COLUMNS, fileResponse } from "@/lib/ws/files";

/** Sabine's photo for the contact card, for everyone signed in to a portal. */
export async function GET() {
  const user = await currentUser();
  if (!user || (user.role !== "owner" && user.role !== "couple")) return new Response("Niet ingelogd", { status: 401 });
  const file = await one<{ name: string; mime: string; size: number; storage_path: string | null; data: Buffer | null }>(
    `select ${FILE_COLUMNS} from settings s join files f on f.id = s.contact_photo_file_id`,
  );
  if (!file) return new Response("Niet gevonden", { status: 404 });
  return fileResponse(file, { onlyImages: true });
}
