import { describe, expect, it } from "vitest";
import { acceptFor, checkUpload, cleanFileName, extensionOf, formatBytes, mimeFor } from "@/lib/ws/upload-rules";

describe("upload rules", () => {
  it("accepts photos up to 15 MB and refuses other types", () => {
    expect(checkUpload("image", "cover.JPG", 3_000_000)).toBeNull();
    expect(checkUpload("image", "cover.jpg", 16 * 1024 * 1024)).toMatch(/groter dan 15,0 MB/);
    expect(checkUpload("image", "offerte.pdf", 1000)).toMatch(/\.pdf is hier niet toegestaan/);
    expect(checkUpload("image", "leeg.png", 0)).toMatch(/leeg/);
  });

  it("allows documents and audio within the Supabase Free limit", () => {
    expect(checkUpload("document", "contract.docx", 20 * 1024 * 1024)).toBeNull();
    expect(checkUpload("audio", "openingsdans.mp3", 40 * 1024 * 1024)).toBeNull();
    expect(checkUpload("audio", "openingsdans.mp3", 60 * 1024 * 1024)).not.toBeNull();
    expect(checkUpload("document", "script.html", 10)).not.toBeNull();
  });

  it("decides the content type from the extension", () => {
    expect(mimeFor(extensionOf("foto.jpeg"))).toBe("image/jpeg");
    expect(mimeFor(extensionOf("lied.m4a"))).toBe("audio/mp4");
    expect(mimeFor(extensionOf("zonder"))).toBe("application/octet-stream");
  });

  it("offers HEIC in the photo picker", () => {
    expect(acceptFor("image")).toContain(".heic");
  });

  it("cleans file names", () => {
    expect(cleanFileName("C:\\fakepath\\mijn\u0007foto.jpg")).toBe("mijnfoto.jpg");
    expect(cleanFileName("   ")).toBe("bestand");
    expect(formatBytes(1536)).toBe("2 kB");
  });
});
