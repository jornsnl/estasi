import { getFiles } from "@/lib/data";
import { getBrandLogos, getLogoCrops, LOGO_KINDS, LOGO_VARIANTS, renderLogo, type LogoKind, type LogoVariant } from "@/lib/brand-logos";

export const dynamic = "force-dynamic";

/** Until Sabine uploads a logo: the icons there were before. */
const FALLBACK: Record<LogoVariant, string | null> = {
  "icon-32": "/pwa/icon.svg",
  "icon-180": "/pwa/apple-180.png",
  "icon-192": "/pwa/beheer-192.png",
  "icon-512": "/pwa/beheer-512.png",
  maskable: "/pwa/beheer-maskable-512.png",
  mail: null,
};

const HEADERS = { "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" };

/**
 * Sabine's logos for mails and app icons, without signing in (a mail client
 * and a home screen fetch them without a session): /api/logo/academy/icon-192.png,
 * /api/logo/estasi/mail.png, /api/logo/app/original. Only the three logos are served.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; variant: string }> }) {
  const { kind, variant: raw } = await params;
  if (!LOGO_KINDS.includes(kind as LogoKind)) return new Response("Niet gevonden", { status: 404 });
  const logos = await getBrandLogos();
  // The beheer app without its own icon takes the logo of Estasi Weddings.
  const own = logos[kind as LogoKind];
  const fileId = own ?? (kind === "app" ? logos.estasi : null);
  const crops = await getLogoCrops();
  const crop = crops[own ? (kind as LogoKind) : "estasi"];
  const variant = raw.replace(/\.png$/, "");

  if (variant === "original") {
    if (!fileId) return new Response("Niet gevonden", { status: 404 });
    const file = await getFiles().read(fileId);
    if (!file || !file.meta.mime.startsWith("image/")) return new Response("Niet gevonden", { status: 404 });
    const svg = file.meta.mime === "image/svg+xml";
    return new Response(new Uint8Array(file.data), {
      headers: {
        ...HEADERS,
        "Content-Type": file.meta.mime,
        // An SVG opened on its own may not run script or load anything.
        ...(svg ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    });
  }

  if (!LOGO_VARIANTS.includes(variant as LogoVariant)) return new Response("Niet gevonden", { status: 404 });
  const png = fileId ? await renderLogo(fileId, variant as LogoVariant, crop).catch((err) => (console.error(`[logo] ${kind} ${variant}: ${(err as Error).message}`), null)) : null;
  if (!png) {
    const fallback = FALLBACK[variant as LogoVariant];
    return fallback ? new Response(null, { status: 302, headers: { Location: fallback, "Cache-Control": "public, max-age=600" } }) : new Response("Niet gevonden", { status: 404 });
  }
  return new Response(new Uint8Array(png), { headers: { ...HEADERS, "Content-Type": "image/png", "Content-Length": String(png.length) } });
}
