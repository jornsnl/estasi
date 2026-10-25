import { describe, expect, it } from "vitest";
import type { Enrollment } from "@/lib/data/types";
import { accessStatus, addMonths, hasLessonAccess, pause, remainingDays, resume } from "@/lib/domain/access";

const base: Enrollment = {
  id: "e",
  userId: "u",
  package: "A",
  purchasedAt: "2026-01-01T12:00:00.000Z",
  endsAt: "2027-01-01T12:00:00.000Z",
  pausedAt: null,
  pauses: [],
  revokedAt: null,
  onlineCompletedAt: null,
  certificateReleasedAt: null,
  certificateCode: null,
  practicalStatus: "none",
  ownerNotes: "",
};

describe("toegang", () => {
  it("12 maanden vanaf aankoop, met correcte maandeinde", () => {
    expect(addMonths("2026-01-01T12:00:00.000Z", 12)).toBe("2027-01-01T12:00:00.000Z");
    expect(addMonths("2026-01-31T12:00:00.000Z", 1)).toBe("2026-02-28T12:00:00.000Z");
  });

  it("status: actief, verlopen, ingetrokken", () => {
    expect(accessStatus(base, new Date("2026-06-01"))).toBe("active");
    expect(accessStatus(base, new Date("2027-01-02"))).toBe("expired");
    expect(accessStatus({ ...base, revokedAt: "2026-03-01T00:00:00Z" }, new Date("2026-06-01"))).toBe("revoked");
  });

  it("pauzeren stopt de resterende tijd en schuift de einddatum op", () => {
    const pausedAt = new Date("2026-06-01T12:00:00Z");
    const paused = { ...base, ...pause(base, pausedAt) };
    expect(accessStatus(paused, pausedAt)).toBe("paused");
    expect(hasLessonAccess(paused, pausedAt)).toBe(false);

    const daysBefore = remainingDays(paused, pausedAt);
    // Time passes while paused: remaining days stay frozen.
    expect(remainingDays(paused, new Date("2026-07-01T12:00:00Z"))).toBe(daysBefore);

    const resumedAt = new Date("2026-07-01T12:00:00Z"); // 30 days later
    const resumed = { ...paused, ...resume(paused, resumedAt) };
    expect(resumed.endsAt).toBe("2027-01-31T12:00:00.000Z");
    expect(resumed.pauses).toEqual([{ pausedAt: pausedAt.toISOString(), resumedAt: resumedAt.toISOString() }]);
    expect(remainingDays(resumed, resumedAt)).toBe(daysBefore);
    expect(accessStatus(resumed, resumedAt)).toBe("active");
  });

  it("verlopen toegang kan niet gepauzeerd worden", () => {
    expect(() => pause(base, new Date("2027-02-01"))).toThrow();
  });
});
