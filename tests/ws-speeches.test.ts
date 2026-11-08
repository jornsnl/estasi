import { describe, expect, it } from "vitest";
import {
  byNextWedding,
  formatMinutes,
  incompleteReasons,
  isIncomplete,
  momentLabel,
  needsOf,
  needsSummary,
  normalizeTime,
  speechesTitle,
  totalMinutes,
} from "@/lib/ws/speeches-pure";

const speech = (over: Partial<{ planned_time: string; status: string; duration_minutes: number | null; needs: string[]; needs_other: string }> = {}) => ({
  planned_time: "21:00",
  status: "bevestigd",
  duration_minutes: 5,
  needs: [] as string[],
  needs_other: "",
  ...over,
});

describe("speeches: onvolledig", () => {
  it("is onvolledig zonder tijd of zolang de status nog aangemeld is", () => {
    expect(isIncomplete(speech())).toBe(false);
    expect(isIncomplete(speech({ planned_time: " " }))).toBe(true);
    expect(isIncomplete(speech({ status: "aangemeld" }))).toBe(true);
    expect(incompleteReasons(speech({ planned_time: "", status: "aangemeld" }))).toEqual(["geen tijd", "nog niet bevestigd"]);
    expect(isIncomplete(speech({ status: "techniek" }))).toBe(false);
  });
});

describe("speeches: duur", () => {
  it("telt de duur op en slaat lege of negatieve duur over", () => {
    expect(totalMinutes([speech({ duration_minutes: 5 }), speech({ duration_minutes: null }), speech({ duration_minutes: 12 }), speech({ duration_minutes: -3 })])).toBe(17);
    expect(totalMinutes([])).toBe(0);
  });
  it("schrijft minuten als minuten en uren", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 uur");
    expect(formatMinutes(95)).toBe("1 uur 35 min");
  });
});

describe("speeches: benodigdheden", () => {
  it("telt vaste benodigdheden en eigen invulling bij elkaar op", () => {
    const list = [
      speech({ needs: ["microfoon", "beamer"], needs_other: "Kaarsje, statafel" }),
      speech({ needs: ["microfoon", "muziek"], needs_other: "kaarsje" }),
      speech({ needs: ["presentatie", "onbekend"] }),
    ];
    expect(needsSummary(list)).toBe("2x microfoon, 1x beamer/scherm, 1x muziek of geluidsfragment, 1x presentatie, 2x Kaarsje, 1x statafel");
    expect(needsSummary([speech()])).toBe("");
  });
  it("telt dezelfde eigen invulling binnen één speech maar één keer", () => {
    expect(needsSummary([speech({ needs_other: "bloemen; Bloemen\nbloemen" })])).toBe("1x bloemen");
  });
  it("geeft de benodigdheden van één speech in vaste volgorde", () => {
    expect(needsOf(speech({ needs: ["laptop", "microfoon"], needs_other: " tafel ," }))).toEqual(["microfoon", "laptop", "tafel"]);
  });
});

describe("speeches: overige", () => {
  it("maakt van ingetypte tijden hh:mm", () => {
    expect(normalizeTime("9.30")).toBe("09:30");
    expect(normalizeTime("21:05")).toBe("21:05");
    expect(normalizeTime("2015")).toBe("20:15");
    expect(normalizeTime("20 uur")).toBe("20:00");
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("na het eten")).toBeNull();
  });
  it("noemt het moment, met eigen invulling", () => {
    expect(momentLabel({ moment: "diner", moment_other: "" })).toBe("Diner (tussen gangen)");
    expect(momentLabel({ moment: "eigen", moment_other: "Bij de taart" })).toBe("Bij de taart");
    expect(momentLabel({ moment: "", moment_other: "" })).toBe("");
  });
  it("geeft de print de titel met beide namen", () => {
    expect(speechesTitle({ partner1_first: "Estelle", partner2_first: "Yannick" })).toBe("Speeches Estelle en Yannick");
    expect(speechesTitle({ partner1_first: "Estelle", partner2_first: "" })).toBe("Speeches Estelle");
  });
  it("sorteert bruidsparen op eerstvolgende trouwdatum", () => {
    const couples = [
      { id: "verleden", wedding_date: "2026-05-01" },
      { id: "geen", wedding_date: null },
      { id: "later", wedding_date: "2027-06-01" },
      { id: "eerst", wedding_date: "2026-12-01" },
      { id: "langer-geleden", wedding_date: "2025-05-01" },
    ];
    expect(byNextWedding(couples, "2026-11-08").map((c) => c.id)).toEqual(["eerst", "later", "geen", "verleden", "langer-geleden"]);
  });
});
