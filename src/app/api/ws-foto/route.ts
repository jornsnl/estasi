import { currentUser } from "@/lib/auth/session";
import { one } from "@/lib/ws/db";

/** Sabine's photo for the contact card, for everyone signed in to a portal. */
export async function GET() {
  const user = await currentUser();
  if (!user || (user.role !== "owner" && user.role !== "couple")) return new Response("Niet ingelogd", { status: 401 });
  const file = await one<{ mime: string; data: Buffer }>(
    "select f.mime, f.data from settings s join files f on f.id = s.contact_photo_file_id",
  );
  if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.mime)) return new Response("Niet gevonden", { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
}
