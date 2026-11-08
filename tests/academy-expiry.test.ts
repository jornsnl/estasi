import { describe, expect, it } from "vitest";
import type { Enrollment } from "@/lib/data/types";
import { accessTermMonths, ACCESS_MONTHS } from "@/lib/domain/access";
import { daysLeft, daysLeftText, dueNotice, expiryBanner, jobDue } from "@/lib/domain/expiry";

const base: Enrollment = {
  id: "e",
  userId: "u",
  package: "A",
  purchasedAt: "2026-01-01T12:00:00.000Z",
  endsAt: "2027-01-01T12:00:00.000Z",
  pausedAt: null,
  practicalCertificateReleasedAt: null,
  practicalCertificateCode: null,
  pauses: [],
  revokedAt: null,
  onlineCompletedAt: null,
  certificateReleasedAt: null,
  certificateCode: null,
  practicalStatus: "none",
  ownerNotes: "",
};

const daysBefore = (days: number) => new Date(new Date(base.endsAt).getTime() - days * 86_400_000);

describe("toegangstermijn (Academy 12)", () => {
  it("standaard 12 maanden; alleen bekende termijnen", () => {
    expect(ACCESS_MONTHS).toBe(12);
    expect(accessTermMonths("12")).toBe(12);
    expect(accessTermMonths("24")).toBe(24);
    expect(accessTermMonths("")).toBe(12);
    expect(accessTermMonths("7")).toBe(12);
    expect(accessTermMonths("-1")).toBe(12);
  });
});

describe("meldingen voor het einde van de toegang", () => {
  it("niets ruim voor de 30 dagen", () => {
    expect(dueNotice(base, [], daysBefore(45))).toEqual({ send: null, record: [] });
  });

  it("30 dagen: de maandmail, eenmalig", () => {
    expect(dueNotice(base, [], daysBefore(30))).toEqual({ send: 30, record: [30] });
    expect(dueNotice(base, [30], daysBefore(29))).toEqual({ send: null, record: [] });
    expect(dueNotice(base, [30], daysBefore(20))).toEqual({ send: null, record: [] });
  });

  it("7 dagen: de weekmail, eenmalig", () => {
    expect(dueNotice(base, [30], daysBefore(7))).toEqual({ send: 7, record: [7] });
    expect(dueNotice(base, [30, 7], daysBefore(3))).toEqual({ send: null, record: [] });
  });

  it("beide drempels tegelijk gemist: alleen de weekmail, allebei vastgelegd", () => {
    expect(dueNotice(base, [], daysBefore(5))).toEqual({ send: 7, record: [30, 7] });
  });

  it("geen meldingen bij gepauzeerde, ingetrokken of verlopen toegang of zonder inschrijving", () => {
    expect(dueNotice({ ...base, pausedAt: daysBefore(40).toISOString() }, [], daysBefore(5)).send).toBeNull();
    expect(dueNotice({ ...base, revokedAt: daysBefore(40).toISOString() }, [], daysBefore(5)).send).toBeNull();
    expect(dueNotice(base, [], new Date(new Date(base.endsAt).getTime() + 1000)).send).toBeNull();
    expect(dueNotice(null, [], daysBefore(5)).send).toBeNull();
  });

  it("banner alleen in de laatste 30 dagen van lopende toegang", () => {
    expect(expiryBanner(base, daysBefore(31))).toBeNull();
    expect(expiryBanner(base, daysBefore(30))).toBe(30);
    expect(expiryBanner(base, daysBefore(1))).toBe(1);
    expect(expiryBanner({ ...base, pausedAt: daysBefore(40).toISOString() }, daysBefore(3))).toBeNull();
    expect(daysLeft(null)).toBeNull();
    expect(daysLeftText(1)).toBe("nog 1 dag");
    expect(daysLeftText(12)).toBe("nog 12 dagen");
  });

  it("de taak draait hoogstens eens per uur", () => {
    const now = new Date("2026-11-08T12:00:00Z");
    expect(jobDue(null, now)).toBe(true);
    expect(jobDue("2026-11-08T11:30:00Z", now)).toBe(false);
    expect(jobDue("2026-11-08T11:00:00Z", now)).toBe(true);
  });
});
