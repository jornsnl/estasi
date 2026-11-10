import { describe, expect, it } from "vitest";
import { followUpDue, forecast, isStage, parseProbability, positionAt, positionBetween } from "@/lib/pipeline/rules";

describe("Pipeline: forecast", () => {
  it("telt per open fase waarde × kans, met de standaardkans als er geen eigen kans is", () => {
    const f = forecast([
      { stage: "nieuw", value_cents: 100_000, probability: null }, // 10% van € 1000
      { stage: "offerte", value_cents: 500_000, probability: 50 }, // 50% van € 5000
      { stage: "offerte", value_cents: null, probability: 80 }, // geen waarde: telt niet mee
      { stage: "geboekt", value_cents: 900_000, probability: null }, // gesloten: niet in de forecast
    ]);
    expect(f.weighted).toBe(10_000 + 250_000);
    expect(f.value).toBe(600_000);
    expect(f.withoutValue).toBe(1);
    const offerte = f.rows.find((r) => r.stage === "offerte")!;
    expect(offerte).toMatchObject({ count: 2, value: 500_000, weighted: 250_000, defaulted: 0, withoutValue: 1 });
    expect(f.rows.find((r) => r.stage === "nieuw")!.defaulted).toBe(1);
    expect(f.rows.map((r) => r.stage)).toEqual(["nieuw", "contact", "kennismaking", "offerte"]);
  });

  it("houdt een kans buiten 0 tot 100 binnen de grenzen", () => {
    expect(forecast([{ stage: "contact", value_cents: 1000, probability: 150 }]).weighted).toBe(1000);
  });
});

describe("Pipeline: volgorde op het bord", () => {
  it("zet een positie tussen de buren in", () => {
    expect(positionBetween(null, null)).toBe(1000);
    expect(positionBetween(null, 1000)).toBe(0);
    expect(positionBetween(1000, null)).toBe(2000);
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
  it("rekent de positie uit voor een plek in de kolom", () => {
    expect(positionAt([], 0)).toBe(1000);
    expect(positionAt([3000, 1000, 2000], 0)).toBe(0);
    expect(positionAt([1000, 2000, 3000], 1)).toBe(1500);
    expect(positionAt([1000, 2000], 9)).toBe(3000);
  });
});

describe("Pipeline: invoer en opvolgen", () => {
  it("leest een kans", () => {
    expect(parseProbability("")).toBeNull();
    expect(parseProbability("45 %")).toBe(45);
    expect(parseProbability("120")).toBe(100);
    expect(() => parseProbability("veel")).toThrow();
  });
  it("kent de fasen", () => {
    expect(isStage("offerte")).toBe(true);
    expect(isStage("klant")).toBe(false);
  });
  it("vraagt om opvolgen als de volgende stap vandaag of eerder is, alleen bij open leads", () => {
    expect(followUpDue({ stage: "contact", next_action_date: "2026-11-10" }, "2026-11-10")).toBe(true);
    expect(followUpDue({ stage: "contact", next_action_date: "2026-11-11" }, "2026-11-10")).toBe(false);
    expect(followUpDue({ stage: "geboekt", next_action_date: "2026-11-01" }, "2026-11-10")).toBe(false);
    expect(followUpDue({ stage: "nieuw", next_action_date: null }, "2026-11-10")).toBe(false);
  });
});
