import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { coupleIdOf } from "@/lib/ws/access";
import { isUuid, one } from "@/lib/ws/db";
import { appUrl } from "@/lib/ws/mail";
import { QR_MARGIN, qrColors, qrFileName } from "@/lib/ws/qr";

/**
 * The QR code of one RSVP form, made here (no outside service), as SVG (for
 * print) or PNG. It holds only the fixed link /rsvp/<slug>: no token and no
 * expiry, and the slug never changes. ?download=1 saves it as a file for the
 * wedding invitation; ?bg=transparent leaves the background out.
 */
export async function GET(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const user = await currentUser();
  if (!user || (user.role !== "owner" && user.role !== "couple")) return new Response("Niet ingelogd", { status: 401 });
  const { formId } = await params;
  if (!isUuid(formId)) return new Response("Niet gevonden", { status: 404 });
  const form = await one<{
    couple_id: string; slug: string; name: string; qr_color: string; qr_background: string; group_name: string | null; partner1_first: string; partner2_first: string;
  }>(
    `select f.couple_id, f.slug, f.name, f.qr_color, f.qr_background, g.name as group_name, c.partner1_first, c.partner2_first
       from rsvp_forms f join couples c on c.id = f.couple_id left join guest_groups g on g.id = f.group_id
      where f.id = $1`,
    [formId],
  );
  if (!form || (user.role !== "owner" && form.couple_id !== (await coupleIdOf(user.id)))) return new Response("Niet gevonden", { status: 404 });

  const url = new URL(req.url);
  const png = url.searchParams.get("format") === "png";
  const transparent = url.searchParams.get("bg") === "transparent";
  const target = `${appUrl()}/rsvp/${form.slug}`;
  const options = { margin: QR_MARGIN, errorCorrectionLevel: "M" as const, color: qrColors(form.qr_color, form.qr_background, transparent) };
  const filename = qrFileName({ type: form.group_name || form.name, partner1: form.partner1_first, partner2: form.partner2_first, transparent, ext: png ? "png" : "svg" });
  const disposition = `${url.searchParams.get("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
  if (png) {
    const buffer = await QRCode.toBuffer(target, { ...options, type: "png", width: 1200 });
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "image/png", "Content-Disposition": disposition, "Cache-Control": "private, no-store" } });
  }
  const svg = await QRCode.toString(target, { ...options, type: "svg" });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Content-Disposition": disposition, "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
