import { one } from "@/lib/ws/db";
import { publicForm } from "@/lib/ws/rsvp";

/** The couple's cover photo on their public RSVP page (only while the form is open). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const found = await publicForm((await params).slug);
  if (!found?.couple.cover_file_id) return new Response("Niet gevonden", { status: 404 });
  const file = await one<{ mime: string; data: Buffer }>("select mime, data from files where id = $1 and couple_id = $2", [found.couple.cover_file_id, found.couple.id]);
  if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.mime)) return new Response("Niet gevonden", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.mime, "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" },
  });
}
