import { describe, expect, it } from "vitest";
import { normaliseUrl } from "@/lib/domain/input";
import { COURSE_STATUS_LABELS, courseStatus } from "@/lib/domain/progress";
import { createSeed } from "@/lib/data/seed";
import { formatDate, fromDateInput, toDateInput } from "@/lib/util/format";

describe("dates from a date field", () => {
  it("stores the chosen day in Amsterdam time, winter and summer", () => {
    expect(fromDateInput("2027-01-31", "23:59")).toBe("2027-01-31T22:59:00.000Z");
    expect(fromDateInput("2027-07-31", "23:59")).toBe("2027-07-31T21:59:00.000Z");
    expect(fromDateInput("2027-03-28", "12:00")).toBe("2027-03-28T10:00:00.000Z");
  });

  it("shows the same day that was chosen", () => {
    for (const day of ["2027-01-31", "2027-03-28", "2027-07-31", "2027-10-31", "2027-12-31"]) {
      const iso = fromDateInput(day, "23:59")!;
      expect(toDateInput(iso)).toBe(day);
      expect(formatDate(iso)).toBe(formatDate(fromDateInput(day, "12:00")));
    }
  });

  it("reads the Amsterdam calendar day for the date field, not the UTC one", () => {
    expect(toDateInput("2027-05-31T22:30:00.000Z")).toBe("2027-06-01");
    expect(toDateInput("2027-05-31T12:00:00.000Z")).toBe("2027-05-31");
  });

  it("refuses dates that do not exist", () => {
    expect(fromDateInput("2027-02-30")).toBeNull();
    expect(fromDateInput("")).toBeNull();
    expect(fromDateInput("31-01-2027")).toBeNull();
  });
});

describe("links", () => {
  it("adds https:// when it is missing", () => {
    expect(normaliseUrl(" vimeo.com/123 ")).toBe("https://vimeo.com/123");
    expect(normaliseUrl("www.estasiweddings.nl")).toBe("https://www.estasiweddings.nl");
    expect(normaliseUrl("https://youtu.be/x")).toBe("https://youtu.be/x");
    expect(normaliseUrl("mailto:a@b.nl")).toBe("mailto:a@b.nl");
    expect(normaliseUrl("")).toBe("");
  });

  it("never keeps a script link", () => {
    expect(normaliseUrl("javascript:alert(1)").startsWith("https://")).toBe(true);
  });
});

describe("course status", () => {
  const eva = createSeed().enrollments.find((e) => e.id === "enr-eva")!;

  it("shows Verlopen for expired access, not Bezig", () => {
    const status = courseStatus(eva, 40, "expired");
    expect(status).toBe("expired");
    expect(COURSE_STATUS_LABELS[status]).toBe("Verlopen");
  });
});
