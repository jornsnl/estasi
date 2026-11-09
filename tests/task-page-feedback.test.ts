import { describe, expect, it } from "vitest";
import { FEEDBACK_STATUS_LABELS, stillOnTaskPage } from "@/lib/domain/feedback";

describe("feedback van cursisten op de Taken-pagina", () => {
  it("heeft de statussen Nieuw, Bezig met nakijken en Klaar", () => {
    expect(Object.values(FEEDBACK_STATUS_LABELS)).toEqual(["Nieuw", "Bezig met nakijken", "Klaar"]);
  });
  it("verdwijnt pas bij Klaar mét verstuurde feedback", () => {
    expect(stillOnTaskPage({ feedbackStatus: "nieuw", lastSentAt: null })).toBe(true);
    expect(stillOnTaskPage({ feedbackStatus: "in_behandeling", lastSentAt: "2026-11-01T10:00:00Z" })).toBe(true);
    expect(stillOnTaskPage({ feedbackStatus: "afgerond", lastSentAt: null })).toBe(true);
    expect(stillOnTaskPage({ feedbackStatus: "afgerond", lastSentAt: "2026-11-01T10:00:00Z" })).toBe(false);
  });
});
