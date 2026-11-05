import { isUuid, one } from "@/lib/db";
import { currentAccount } from "@/lib/auth/session";

/** Serves a stored file after checking that the viewer may see that couple's files. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await currentAccount();
  if (!account) return new Response("Niet ingelogd", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Niet gevonden", { status: 404 });
  const file = await one<{ couple_id: string | null; name: string; mime: string; size: number; data: Buffer }>(
    "select couple_id, name, mime, size, data from files where id = $1",
    [id],
  );
  // Same answer for "missing" and "someone else's", so ids reveal nothing.
  if (!file || (account.role !== "admin" && file.couple_id !== account.couple_id)) {
    return new Response("Niet gevonden", { status: 404 });
  }
  const inline = /^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.mime);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
