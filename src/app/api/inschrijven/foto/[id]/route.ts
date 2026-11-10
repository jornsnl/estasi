import { getFiles } from "@/lib/data";
import { isUuid } from "@/lib/db";
import { isSignupImage } from "@/lib/signup-page";

/**
 * The pictures of the public sign up page (/inschrijven): logo, photo of Sabine and the review
 * photos. Only the files the page names right now are served, without signing in.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id) || !(await isSignupImage(id))) return new Response("Niet gevonden", { status: 404 });
  const file = await getFiles().read(id);
  if (!file) return new Response("Niet gevonden", { status: 404 });
  const { meta } = file;
  const svg = meta.mime === "image/svg+xml";
  if (!meta.mime.startsWith("image/")) return new Response("Niet gevonden", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Length": String(meta.size),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // An SVG logo opened on its own may not run script or load anything.
      ...(svg ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}
