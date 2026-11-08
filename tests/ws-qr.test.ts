import { createRequire } from "module";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { QR_DARK, QR_MARGIN, qrColors, qrFileName } from "@/lib/ws/qr";

// pngjs comes with qrcode (it writes the PNGs) and has no types of its own.
const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(b: Buffer): { width: number; data: Buffer } } } };

describe("QR-code", () => {
  it("bouwt de bestandsnaam uit type gast en de namen van het bruidspaar", () => {
    expect(qrFileName({ type: "Daggasten", partner1: "Sabine", partner2: "Peter", transparent: false, ext: "png" })).toBe("QR-code Daggasten Sabine en Peter.png");
    expect(qrFileName({ type: "Daggasten", partner1: "Sabine", partner2: "Peter", transparent: false, ext: "svg" })).toBe("QR-code Daggasten Sabine en Peter.svg");
    expect(qrFileName({ type: "Avondgasten", partner1: "Sabine", partner2: "Peter", transparent: true, ext: "png" })).toBe("QR-code Avondgasten Sabine en Peter transparant.png");
  });

  it("laat ongeldige tekens weg", () => {
    expect(qrFileName({ type: 'Dag/avond: "VIP"?', partner1: "Anne*", partner2: "Mark<3>", transparent: false, ext: "png" })).toBe("QR-code Dagavond VIP Anne en Mark3.png");
    expect(qrFileName({ type: "Daggasten", partner1: "Sabine", partner2: "", transparent: false, ext: "png" })).toBe("QR-code Daggasten Sabine.png");
  });

  it("transparant: donkere blokjes en geen achtergrond", () => {
    expect(qrColors("#6B1E2E", "#ffffff", true)).toEqual({ dark: "#6B1E2E", light: "#00000000" });
    expect(qrColors("#f5f0e8", "#ffffff", true)).toEqual({ dark: QR_DARK, light: "#00000000" });
    expect(qrColors("#2c2c2c", "#ffffff", false)).toEqual({ dark: "#2c2c2c", light: "#ffffff" });
  });

  it("maakt een transparante PNG met een rand van minstens 4 modules", async () => {
    expect(QR_MARGIN).toBeGreaterThanOrEqual(4);
    const buffer = await QRCode.toBuffer("http://localhost:3000/rsvp/abcdefghijkl", { type: "png", margin: QR_MARGIN, scale: 1, color: qrColors("#2c2c2c", "#ffffff", true) });
    const png = PNG.sync.read(buffer);
    const modules = QRCode.create("http://localhost:3000/rsvp/abcdefghijkl", { errorCorrectionLevel: "M" }).modules.size;
    expect(png.width).toBe(modules + 2 * QR_MARGIN);
    const alpha = (x: number, y: number) => png.data[(png.width * y + x) * 4 + 3];
    // The corner (quiet zone) is fully transparent; the finder pattern is opaque and dark.
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(QR_MARGIN, QR_MARGIN)).toBe(255);
    expect(png.data[(png.width * QR_MARGIN + QR_MARGIN) * 4]).toBeLessThan(80);
  });

  it("SVG: vaste link, rand van 4 modules, transparant zonder achtergrondvlak", async () => {
    const link = "http://localhost:3000/rsvp/abcdefghijkl";
    const size = QRCode.create(link, { errorCorrectionLevel: "M" }).modules.size + 2 * QR_MARGIN;
    const white = await QRCode.toString(link, { type: "svg", margin: QR_MARGIN, errorCorrectionLevel: "M", color: qrColors("#2c2c2c", "#ffffff", false) });
    const clear = await QRCode.toString(link, { type: "svg", margin: QR_MARGIN, errorCorrectionLevel: "M", color: qrColors("#2c2c2c", "#ffffff", true) });
    expect(white).toContain(`viewBox="0 0 ${size} ${size}"`);
    expect(white).toContain('fill="#ffffff"');
    expect(clear).not.toContain("fill=");
    expect(clear).toContain('stroke="#2c2c2c"');
  });
});
