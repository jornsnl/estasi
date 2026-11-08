import { describe, expect, it } from "vitest";
import {
  assessmentProblem,
  certificateCode,
  feedbackSlots,
  matchesRequest,
  nextFeedbackStatus,
  onlineCertificateReadiness,
  parseRequestFilter,
  practicalCertificateReadiness,
  slotsText,
} from "@/lib/domain/feedback";

describe("feedbackverzoeken per module", () => {
  it("telt wat er nog over is, ook als deze opdracht er al een heeft", () => {
    expect(feedbackSlots(0, false)).toEqual({ used: 0, left: 2, limit: 2, blocked: false });
    expect(feedbackSlots(0, true)).toMatchObject({ used: 1, left: 1, blocked: false });
    expect(feedbackSlots(1, true)).toMatchObject({ used: 2, left: 0, blocked: false });
    expect(feedbackSlots(1, false)).toMatchObject({ left: 1, blocked: false });
    // The third request: not possible here, the other two hold the slots.
    expect(feedbackSlots(2, false)).toMatchObject({ used: 2, left: 0, blocked: true });
    // This one already holds a slot (asked with an earlier version): never blocked.
    expect(feedbackSlots(2, true)).toMatchObject({ left: 0, blocked: false });
    expect(slotsText(1)).toBe("Je hebt in deze module nog 1 van 2 feedbackverzoeken.");
  });
});

describe("status van een verzoek", () => {
  it("indienen: nieuw bij een verzoek of eindopdracht, anders geen status", () => {
    expect(nextFeedbackStatus(null, { type: "submitted", requested: true, graded: false })).toBe("nieuw");
    expect(nextFeedbackStatus(null, { type: "submitted", requested: false, graded: true })).toBe("nieuw");
    expect(nextFeedbackStatus(null, { type: "submitted", requested: false, graded: false })).toBeNull();
  });

  it("concept: in behandeling; versturen: afgerond; zonder verzoek blijft het zonder status", () => {
    expect(nextFeedbackStatus("nieuw", { type: "concept" })).toBe("in_behandeling");
    expect(nextFeedbackStatus("in_behandeling", { type: "concept" })).toBe("in_behandeling");
    // Extra feedback after it was done does not reopen the request.
    expect(nextFeedbackStatus("afgerond", { type: "concept" })).toBe("afgerond");
    expect(nextFeedbackStatus("in_behandeling", { type: "sent" })).toBe("afgerond");
    expect(nextFeedbackStatus("nieuw", { type: "sent" })).toBe("afgerond");
    expect(nextFeedbackStatus(null, { type: "sent" })).toBeNull();
    expect(nextFeedbackStatus(null, { type: "concept" })).toBeNull();
    expect(nextFeedbackStatus("afgerond", { type: "manual", status: "nieuw" })).toBe("nieuw");
    expect(nextFeedbackStatus(null, { type: "manual", status: "afgerond" })).toBeNull();
  });

  it("beoordelen alleen bij de nieuwste ingediende versie van een eindopdracht", () => {
    expect(assessmentProblem({ graded: true, isLatest: true, status: "ingediend" })).toBeNull();
    expect(assessmentProblem({ graded: true, isLatest: true, status: "verbetering_nodig" })).toBeNull();
    expect(assessmentProblem({ graded: false, isLatest: true, status: "ingediend" })).toMatch(/eindopdracht/);
    expect(assessmentProblem({ graded: true, isLatest: false, status: "ingediend" })).toMatch(/nieuwere versie/);
    expect(assessmentProblem({ graded: true, isLatest: true, status: "concept" })).toMatch(/niet ingediend/);
  });
});

describe("certificaten", () => {
  const modules = [
    { title: "Basis", lessonsTotal: 3, lessonsCompleted: 3 },
    { title: "Leeg", lessonsTotal: 0, lessonsCompleted: 0 },
  ];

  it("online: alle modules af, alle eindopdrachten voldoende en de afronding bevestigd", () => {
    expect(onlineCertificateReadiness({ modules, graded: [{ title: "Eindtoets", lesson: "Afsluiting", status: "voldoende" }], onlineConfirmed: true })).toEqual({
      ready: true,
      missing: [],
    });
    const r = onlineCertificateReadiness({
      modules: [{ title: "Basis", lessonsTotal: 3, lessonsCompleted: 1 }, { title: "Gesprek", lessonsTotal: 1, lessonsCompleted: 0 }],
      graded: [
        { title: "Eindtoets", lesson: "Afsluiting", status: "verbetering_nodig" },
        { title: "Portfolio", lesson: "Afsluiting", status: "ingediend" },
        { title: "Casus", lesson: "Afsluiting", status: null },
      ],
      onlineConfirmed: false,
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual([
      'Module "Basis": nog 2 van 3 lessen niet afgerond.',
      'Module "Gesprek": nog 1 van 1 les niet afgerond.',
      'Eindopdracht "Eindtoets" (Afsluiting): verbetering nodig, wacht op een aangepaste versie.',
      'Eindopdracht "Portfolio" (Afsluiting) is ingediend maar nog niet beoordeeld.',
      'Eindopdracht "Casus" (Afsluiting) is nog niet ingediend.',
      "Bevestig eerst de online afronding.",
    ]);
    expect(onlineCertificateReadiness({ modules: [], graded: [], onlineConfirmed: true }).ready).toBe(false);
  });

  it("praktijk: alleen pakket B met afgeronde meeloopbruiloft", () => {
    expect(practicalCertificateReadiness({ package: "B", practicalStatus: "completed" })).toEqual({ ready: true, missing: [] });
    expect(practicalCertificateReadiness({ package: "B", practicalStatus: "planned" }).missing[0]).toMatch(/meeloopbruiloft/);
    expect(practicalCertificateReadiness({ package: "A", practicalStatus: "completed" }).missing[0]).toMatch(/pakket B/);
    expect(certificateCode("praktijk", 2026, "a1b2c3")).toBe("WPP-2026-A1B2C3");
    expect(certificateCode("online", 2026, "a1b2c3")).toBe("WPA-2026-A1B2C3");
  });
});

describe("filters van het feedbackoverzicht", () => {
  const item = (feedbackStatus: "nieuw" | "in_behandeling" | "afgerond", userId = "u1", moduleId: string | null = "m1") => ({ feedbackStatus, userId, moduleId });

  it("leest de filters uit de adresregel; standaard de openstaande", () => {
    expect(parseRequestFilter({})).toEqual({ status: "open" });
    expect(parseRequestFilter({ status: "afgerond", cursist: "u1", module: "m1" })).toEqual({ status: "afgerond", userId: "u1", moduleId: "m1" });
    expect(parseRequestFilter({ status: "onzin" })).toEqual({ status: "open" });
  });

  it("filtert op status, cursist en module", () => {
    expect(matchesRequest(item("nieuw"), { status: "open" })).toBe(true);
    expect(matchesRequest(item("in_behandeling"), { status: "open" })).toBe(true);
    expect(matchesRequest(item("afgerond"), { status: "open" })).toBe(false);
    expect(matchesRequest(item("afgerond"), { status: "afgerond" })).toBe(true);
    expect(matchesRequest(item("nieuw"), { status: "in_behandeling" })).toBe(false);
    expect(matchesRequest(item("afgerond"), { status: "alle" })).toBe(true);
    expect(matchesRequest(item("nieuw", "u2"), { status: "alle", userId: "u1" })).toBe(false);
    expect(matchesRequest(item("nieuw", "u1", "m2"), { status: "alle", moduleId: "m1" })).toBe(false);
    expect(matchesRequest(item("nieuw", "u1", "m1"), { status: "nieuw", userId: "u1", moduleId: "m1" })).toBe(true);
  });
});
