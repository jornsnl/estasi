import { describe, expect, it } from "vitest";
import {
  categoryFilled,
  instagramHref,
  instagramLabel,
  moveInList,
  professionAndRegion,
  recommendationCount,
  showRecommendationBar,
  telHref,
  websiteHref,
} from "@/lib/ws/recommendations";
import { checkUpload } from "@/lib/ws/upload-rules";

describe("aanraders", () => {
  it("counts per category", () => {
    expect(recommendationCount(4, "Fotograaf")).toBe("4 aanraders in fotograaf");
    expect(recommendationCount(1, "Bloemist")).toBe("1 aanrader in bloemist");
    expect(recommendationCount(0, "Trouwauto")).toBe("0 aanraders in trouwauto");
  });

  it("makes links of what Sabine typed", () => {
    expect(websiteHref("www.studio.nl")).toBe("https://www.studio.nl");
    expect(websiteHref("http://studio.nl")).toBe("http://studio.nl");
    expect(websiteHref("  ")).toBe("");
    expect(telHref("06 - 12 34 56 78")).toBe("tel:0612345678");
    expect(telHref("+31 (0)6 1234")).toBe("tel:+31061234");
  });

  it("understands Instagram as account or link", () => {
    expect(instagramHref("@studio.licht")).toBe("https://www.instagram.com/studio.licht/");
    expect(instagramHref("studio_licht")).toBe("https://www.instagram.com/studio_licht/");
    expect(instagramHref("instagram.com/studio")).toBe("https://instagram.com/studio");
    expect(instagramHref("https://www.instagram.com/studio/")).toBe("https://www.instagram.com/studio/");
    expect(instagramHref("")).toBe("");
    expect(instagramLabel("https://www.instagram.com/studio/")).toBe("@studio");
    expect(instagramLabel("@studio")).toBe("@studio");
  });

  it("joins profession and region", () => {
    expect(professionAndRegion("Fotograaf", "Utrecht")).toBe("Fotograaf · Utrecht");
    expect(professionAndRegion("Fotograaf", "")).toBe("Fotograaf");
    expect(professionAndRegion("", "")).toBe("");
  });

  it("shows the bar only with visible recommendations while still choosing", () => {
    expect(showRecommendationBar([{ status: "tbd", name: "" }], 2)).toBe(true);
    expect(showRecommendationBar([{ status: "tbd", name: "" }], 0)).toBe(false);
    expect(showRecommendationBar([{ status: "booked", name: "X" }], 3)).toBe(false);
    expect(showRecommendationBar([{ status: "booked", name: "X" }, { status: "talking", name: "Y" }], 3)).toBe(true);
  });

  it("knows when a category is filled in", () => {
    expect(categoryFilled([{ status: "tbd", name: "" }])).toBe(false);
    expect(categoryFilled([{ status: "tbd", name: " " }])).toBe(false);
    expect(categoryFilled([{ status: "tbd", name: "Studio" }])).toBe(true);
    expect(categoryFilled([{ status: "not_needed", name: "" }])).toBe(true);
  });

  it("moves within the category", () => {
    expect(moveInList(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b", "c"], "a", "up")).toBeNull();
    expect(moveInList(["a", "b", "c"], "c", "down")).toBeNull();
    expect(moveInList(["a"], "x", "down")).toBeNull();
  });

  it("only accepts a PDF as brochure", () => {
    expect(checkUpload("pdf", "brochure.pdf", 1000)).toBeNull();
    expect(checkUpload("pdf", "brochure.docx", 1000)).not.toBeNull();
  });
});
