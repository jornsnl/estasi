// QR codes of the RSVP forms: file name and colours. Pure, so it is unit tested.

/** Quiet zone around the code, in modules (scanners need at least 4). */
export const QR_MARGIN = 4;
/** Used when the chosen colour is too light to scan on a transparent background. */
export const QR_DARK = "#2c2c2c";

/** Characters not allowed in a file name on Windows, macOS or Linux, and control characters. */
const INVALID = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/**
 * "QR-code Daggasten Sabine en Peter.png"; with a transparent background
 * "QR-code Daggasten Sabine en Peter transparant.png". Invalid characters are
 * left out; an empty part is skipped.
 */
export function qrFileName(opts: { type: string; partner1: string; partner2: string; transparent: boolean; ext: "png" | "svg" }): string {
  const clean = (s: string) => s.replace(INVALID, "").replace(/\s+/g, " ").trim();
  const partners = [clean(opts.partner1), clean(opts.partner2)].filter(Boolean).join(" en ");
  const base = ["QR-code", clean(opts.type), partners, opts.transparent ? "transparant" : ""].filter(Boolean).join(" ").replace(/^\.+/, "");
  return `${base.slice(0, 180)}.${opts.ext}`;
}

/** Relative luminance (0 black to 1 white) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colours to draw with. Transparent: dark modules (the chosen colour when
 * it is dark enough, otherwise near black) and no background at all.
 */
export function qrColors(color: string, background: string, transparent: boolean): { dark: string; light: string } {
  const valid = (c: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);
  const dark = valid(color, QR_DARK);
  if (transparent) return { dark: luminance(dark) <= 0.2 ? dark : QR_DARK, light: "#00000000" };
  return { dark, light: valid(background, "#ffffff") };
}
