import { describe, expect, it } from "vitest";
import { inlineFormatHtml, parseInlineFormat, stripInlineFormat, toggleInlineMark } from "@/lib/domain/inline-format";

const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("opmaak in schrijfblokken (feedback Sabine)", () => {
  it("leest vet, schuin en onderstreept", () => {
    expect(parseInlineFormat("Een **vette** en *schuine* en __onderstreepte__ tekst")).toEqual([
      "Een ",
      { mark: "bold", children: ["vette"] },
      " en ",
      { mark: "italic", children: ["schuine"] },
      " en ",
      { mark: "underline", children: ["onderstreepte"] },
      " tekst",
    ]);
  });

  it("laat gewone tekst met sterretjes en underscores staan", () => {
    expect(parseInlineFormat("2 * 3 * 4 en mijn_bestand_naam")).toEqual(["2 * 3 * 4 en mijn_bestand_naam"]);
    expect(parseInlineFormat("Vraag zonder opmaak")).toEqual(["Vraag zonder opmaak"]);
  });

  it("kan opmaak combineren", () => {
    expect(parseInlineFormat("**vet en *schuin***")).toEqual([{ mark: "bold", children: ["vet en ", { mark: "italic", children: ["schuin"] }] }]);
  });

  it("haalt de tekens weg waar alleen platte tekst kan", () => {
    expect(stripInlineFormat("Wat is je **grootste** __droom__?")).toBe("Wat is je grootste droom?");
  });

  it("maakt veilige HTML voor de portfolio-export", () => {
    expect(inlineFormatHtml("**<b>** & *x*", escape)).toBe("<strong>&lt;b&gt;</strong> &amp; <em>x</em>");
  });

  it("zet opmaak om de selectie en haalt hem er weer af", () => {
    const on = toggleInlineMark("Een woord hier", 4, 9, "bold");
    expect(on.text).toBe("**woord**");
    const after = "Een **woord** hier";
    expect(after.slice(on.from + 0, on.to)).toBe("woord");
    const off = toggleInlineMark(after, on.from, on.to, "bold");
    expect(after.slice(0, off.replaceFrom) + off.text + after.slice(off.replaceTo)).toBe("Een woord hier");
  });

  it("houdt spaties buiten de tekens en vult een lege selectie", () => {
    expect(toggleInlineMark("a woord b", 1, 8, "underline").text).toBe(" __woord__ ");
    expect(toggleInlineMark("", 0, 0, "italic").text).toBe("*tekst*");
  });
});
