import { describe, expect, it } from "vitest";
import { extractColors, partyNames, splitName, timeKey } from "@/lib/ws/pure";

describe("RSVP", () => {
  it("splitst namen in voor- en achternaam", () => {
    expect(splitName("Jan Verheuven")).toEqual({ first: "Jan", last: "Verheuven" });
    expect(splitName("  Anne  van der Berg ")).toEqual({ first: "Anne", last: "van der Berg" });
    expect(splitName("Kees")).toEqual({ first: "Kees", last: "" });
  });
  it("haalt meegenomen gasten uit het tekstveld, ieder apart", () => {
    expect(partyNames("Jan Verheuven\nLisa, Tom ;")).toEqual(["Jan Verheuven", "Lisa", "Tom"]);
    expect(partyNames("   ")).toEqual([]);
    expect(partyNames(Array.from({ length: 20 }, (_, i) => `G${i}`).join("\n"))).toHaveLength(12);
  });
});

describe("draaiboek", () => {
  it("sorteert op tijd, regels zonder tijd achteraan", () => {
    const times = ["11:00", "8:30", "", "08.45", "22:00 uur"];
    expect([...times].sort((a, b) => timeKey(a) - timeKey(b))).toEqual(["8:30", "08.45", "11:00", "22:00 uur", ""]);
  });
});

describe("stylingplan", () => {
  it("haalt hexkleuren uit het AI-concept", () => {
    expect(extractColors("Terracotta #C98B6B, saliegroen #7e9c86 en nog eens #c98b6b; geen #12345")).toEqual(["#c98b6b", "#7e9c86"]);
  });
});
