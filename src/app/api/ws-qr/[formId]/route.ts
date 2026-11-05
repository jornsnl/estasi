import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { coupleIdOf } from "@/lib/ws/access";
import { isUuid, one } from "@/lib/ws/db";
import { appUrl } from "@/lib/ws/mail";

/**
 * The QR code of one RSVP form, in the form's colours, as SVG (for print)
 * or PNG. ?download=1 saves it as a file for the wedding invitation.
 */
export async function GET(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const user = await currentUser();
  if (!user || (user.role !== "owner" && user.role !== "couple")) return new Response("Niet ingelogd", { status: 401 });
  const { formId } = await params;
  if (!isUuid(formId)) return new Response("Niet gevonden", { status: 404 });
  const form = await one<{ couple_id: string; slug: string; name: string; qr_color: string; qr_background: string }>(
    "select couple_id, slug, name, qr_color, qr_background from rsvp_forms where id = $1",
    [formId],
  );
  if (!form || (user.role !== "owner" && form.couple_id !== (await coupleIdOf(user.id)))) return new Response("Niet gevonden", { status: 404 });

  const url = new URL(req.url);
  const png = url.searchParams.get("format") === "png";
  const target = `${appUrl()}/rsvp/${form.slug}`;
  const options = { margin: 2, errorCorrectionLevel: "M" as const, color: { dark: form.qr_color, light: form.qr_background } };
  const filename = `RSVP ${form.name}.${png ? "png" : "svg"}`;
  const disposition = `${url.searchParams.get("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
  if (png) {
    const buffer = await QRCode.toBuffer(target, { ...options, type: "png", width: 1200 });
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "image/png", "Content-Disposition": disposition, "Cache-Control": "private, no-store" } });
  }
  const svg = await QRCode.toString(target, { ...options, type: "svg" });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": disposition, "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
}
