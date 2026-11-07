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

import { fillTemplate, isQuestionVisible } from "@/lib/ws/pure";

describe("RSVP helpers", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fillTemplate("Bruiloft van [namen] op [datum], [iets]", { namen: "Estelle & Ramon", datum: "12 juni 2027" })).toBe(
      "Bruiloft van Estelle & Ramon op 12 juni 2027, [iets]",
    );
  });

  it("shows a question only when the other answer matches", () => {
    const qs = [
      { id: "a", show_if_question_id: null, show_if_value: "" },
      { id: "b", show_if_question_id: "a", show_if_value: "Ja" },
      { id: "c", show_if_question_id: "b", show_if_value: "" },
      { id: "d", show_if_question_id: "e", show_if_value: "x" },
      { id: "e", show_if_question_id: "d", show_if_value: "x" },
    ];
    expect(isQuestionVisible(qs[1], qs, { a: "ja" })).toBe(true);
    expect(isQuestionVisible(qs[1], qs, { a: "Nee" })).toBe(false);
    expect(isQuestionVisible(qs[2], qs, { a: "Nee", b: "iets" })).toBe(false);
    expect(isQuestionVisible(qs[2], qs, { a: "Ja", b: "iets" })).toBe(true);
    expect(isQuestionVisible(qs[1], qs, { a: ["Nee", "Ja"] })).toBe(true);
    expect(isQuestionVisible(qs[3], qs, { d: "x", e: "x" })).toBe(false);
  });
});

import { householdNames, matchInvitation } from "@/lib/ws/pure";

describe("Uitnodigingslijst", () => {
  it("splits households", () => {
    expect(householdNames("Jan & Els de Vries")).toEqual(["Jan de Vries", "Els de Vries"]);
    expect(householdNames("Piet Jansen, Anna Smit en Kees")).toEqual(["Piet Jansen", "Anna Smit", "Kees"]);
    expect(householdNames("Oma Truus")).toEqual(["Oma Truus"]);
  });

  it("knows who responded", () => {
    const responses = [
      { id: "r1", email: "jan@x.nl", people: ["Jan de Vries", "Els de Vries"] },
      { id: "r2", email: "kim@x.nl", people: ["Kim Bakker"] },
    ];
    expect(matchInvitation({ email: "JAN@x.nl", names: "Familie", response_id: null }, responses)).toMatchObject({ state: "yes", responseId: "r1" });
    expect(matchInvitation({ email: "", names: "Jan & Els de Vries", response_id: null }, responses)).toMatchObject({ state: "yes", responseId: "r1" });
    expect(matchInvitation({ email: "", names: "Kim van Dijk", response_id: null }, responses)).toMatchObject({ state: "maybe", candidate: "Kim Bakker" });
    expect(matchInvitation({ email: "", names: "Bert", response_id: null }, responses).state).toBe("no");
    expect(matchInvitation({ email: "", names: "Bert", response_id: "r2" }, responses).state).toBe("yes");
  });
});

import { indexForTime, timeOutOfOrder } from "@/lib/ws/pure";

describe("Dagplanning", () => {
  const rows = [
    { id: "a", at_time: "10:00" },
    { id: "b", at_time: "" },
    { id: "c", at_time: "12:00" },
    { id: "d", at_time: "14:00" },
  ];
  it("puts a row with a new time in its place", () => {
    expect(indexForTime(rows, "d", "11:00")).toBe(2);
    expect(indexForTime(rows, "a", "13:00")).toBe(2);
    expect(indexForTime(rows, "c", "8:30")).toBe(0);
    expect(indexForTime(rows, "b", "")).toBe(1);
  });
  it("marks a dragged row whose time does not fit", () => {
    expect(timeOutOfOrder(rows, 2)).toBe(false);
    expect(timeOutOfOrder([{ at_time: "12:00" }, { at_time: "10:00" }, { at_time: "14:00" }], 1)).toBe(true);
    expect(timeOutOfOrder([{ at_time: "12:00" }, { at_time: "" }], 1)).toBe(false);
  });
});

import { parseStylingProposal } from "@/lib/ws/pure";

describe("AI-samenvatting stylingplan", () => {
  it("reads the JSON and keeps only known places", () => {
    const text = 'Hier is het:\n```json\n{"samenvatting":"Romantisch.","kleuren":["#AABBCC","rood"],"items":[{"plek":"diner","wat":"Kaarsen"},{"plek":"Tuin","wat":"x"}]}\n```';
    expect(parseStylingProposal(text, ["Diner", "Entree"])).toEqual({ summary: "Romantisch.", colors: ["#aabbcc"], items: [{ place: "Diner", what: "Kaarsen" }] });
  });
  it("falls back to the plain text", () => {
    expect(parseStylingProposal("Geen JSON, wel #112233", ["Diner"])).toEqual({ summary: "Geen JSON, wel #112233", colors: ["#112233"], items: [] });
  });
});

import { dietSummary } from "@/lib/ws/pure";

describe("Eten en allergieën", () => {
  it("sums up diets", () => {
    expect(dietSummary(["Vegetarisch", "vega", "glutenvrij", "notenallergie", "geen", "", "Kiwi", "veganist"])).toBe("1 vegan, 2 vega, 1 glutenvrij, 1 noten, 1 overig");
    expect(dietSummary([])).toBe("");
  });
});

import { budgetLine, costDifference, costRemaining, payingSoon } from "@/lib/ws/pure";

describe("Kosten", () => {
  const eur = (c: number) => `€ ${c / 100}`;
  it("works out difference, remaining and due payments", () => {
    expect(costDifference(1000, 1200)).toBe(-200);
    expect(costDifference(1000, null)).toBeNull();
    expect(costRemaining(1200, 300, false)).toBe(900);
    expect(costRemaining(1200, 300, true)).toBe(0);
    expect(payingSoon("2026-11-20", false, "2026-11-07")).toBe(true);
    expect(payingSoon("2026-12-20", false, "2026-11-07")).toBe(false);
    expect(payingSoon("2026-11-01", false, "2026-11-07")).toBe(true);
    expect(payingSoon("2026-11-10", true, "2026-11-07")).toBe(false);
  });
  it("counts the budget down", () => {
    expect(budgetLine(2450000, 2500000, eur)).toEqual({ text: "Begroot: € 24500 van € 25000, nog € 500 over", over: false });
    expect(budgetLine(2600000, 2500000, eur).over).toBe(true);
  });
});
