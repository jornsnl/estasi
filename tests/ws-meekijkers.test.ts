import { describe, expect, it } from "vitest";
import {
  guestContactColumns,
  guestHeadings,
  supplierContactColumns,
  supplierHeadings,
  viewerFields,
  type DraaiboekViewer,
} from "@/lib/ws/draaiboek-viewer";
import {
  accessState,
  awaitsCouple,
  canView,
  consentQuestion,
  draaiboekTitle,
  eligibleStudent,
  lastDay,
  stateLabel,
} from "@/lib/ws/meekijkers-pure";

describe("meelopende cursist: einddatum", () => {
  it("stopt 7 dagen na de trouwdatum, ook over een maandgrens", () => {
    expect(lastDay("2026-06-20")).toBe("2026-06-27");
    expect(lastDay("2026-12-28")).toBe("2027-01-04");
    expect(lastDay(null)).toBeNull();
    expect(lastDay("geen datum")).toBeNull();
  });
});

describe("meelopende cursist: status", () => {
  const wedding = "2026-06-20";
  it("wacht en actief tot en met de laatste dag, daarna verlopen", () => {
    expect(accessState({ status: "pending" }, wedding, "2026-06-01")).toBe("wacht");
    expect(accessState({ status: "active" }, wedding, "2026-06-20")).toBe("actief");
    expect(accessState({ status: "active" }, wedding, "2026-06-27")).toBe("actief");
    expect(accessState({ status: "active" }, wedding, "2026-06-28")).toBe("verlopen");
    expect(accessState({ status: "pending" }, wedding, "2026-07-01")).toBe("verlopen");
  });
  it("afgewezen en ingetrokken blijven wat ze zijn, ook na de bruiloft", () => {
    expect(accessState({ status: "declined" }, wedding, "2026-06-01")).toBe("afgewezen");
    expect(accessState({ status: "revoked" }, wedding, "2026-06-01")).toBe("ingetrokken");
    expect(accessState({ status: "revoked" }, wedding, "2027-01-01")).toBe("ingetrokken");
  });
  it("zonder trouwdatum verloopt niets", () => {
    expect(accessState({ status: "active" }, null, "2030-01-01")).toBe("actief");
  });
  it("alleen actief opent het draaiboek; alleen wacht kan het bruidspaar beantwoorden", () => {
    expect(canView("actief")).toBe(true);
    for (const s of ["wacht", "afgewezen", "ingetrokken", "verlopen"] as const) expect(canView(s)).toBe(false);
    expect(awaitsCouple("wacht")).toBe(true);
    expect(awaitsCouple("actief")).toBe(false);
  });
  it("toont Sabine de statussen in woorden", () => {
    expect(stateLabel("wacht")).toBe("Wacht op akkoord bruidspaar");
    expect(stateLabel("afgewezen")).toBe("Afgewezen door bruidspaar");
    expect(stateLabel("ingetrokken", "couple")).toBe("Ingetrokken door bruidspaar");
    expect(stateLabel("ingetrokken", "admin")).toBe("Ingetrokken door Sabine");
    expect(stateLabel("verlopen")).toBe("Verlopen");
  });
});

describe("meelopende cursist: wie mag", () => {
  const base = { package: "B", revokedAt: null, pausedAt: null, endsAt: "2027-01-01T00:00:00Z" };
  const now = new Date("2026-11-08T12:00:00Z");
  it("alleen pakket B met actieve toegang", () => {
    expect(eligibleStudent(base, now)).toBe(true);
    expect(eligibleStudent({ ...base, package: "A" }, now)).toBe(false);
    expect(eligibleStudent({ ...base, pausedAt: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(eligibleStudent({ ...base, revokedAt: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(eligibleStudent({ ...base, endsAt: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(eligibleStudent(null, now)).toBe(false);
  });
});

describe("meelopende cursist: teksten", () => {
  it("noemt de cursist in de vraag en meldt de allergieën", () => {
    const [question, allergies] = consentQuestion("Noor Jansen");
    expect(question).toContain("Sabine wil graag dat Noor Jansen, cursist van de Estasi Academy, met haar meeloopt op jullie bruiloft.");
    expect(question).toContain("Geven jullie hier toestemming voor?");
    expect(allergies).toContain("allergieën en dieetwensen per gast");
  });
  it("maakt de knoptekst met beide partners", () => {
    expect(draaiboekTitle({ partner1_first: "Estelle", partner2_first: "Yannick" })).toBe("Draaiboek Estelle en Yannick");
    expect(draaiboekTitle({ partner1_first: "Estelle", partner2_first: " " })).toBe("Draaiboek Estelle");
  });
});

describe("draaiboek per kijker", () => {
  it("de cursist krijgt geen contactgegevens, speeches, kosten of printknop, wel allergieën", () => {
    const f = viewerFields("student");
    expect(f).toMatchObject({ guestContact: false, supplierContact: false, speeches: false, costs: false, print: false, chooseTabs: false, portalLinks: false, diet: true });
  });
  it("speeches alleen voor Sabine", () => {
    const viewers: DraaiboekViewer[] = ["admin", "couple", "student"];
    expect(viewers.filter((v) => viewerFields(v).speeches)).toEqual(["admin"]);
    expect(viewers.filter((v) => viewerFields(v).diet)).toEqual(viewers);
  });
  it("haalt verborgen velden niet eens op", () => {
    expect(guestContactColumns(viewerFields("couple"))).toBe("g.phone");
    expect(guestContactColumns(viewerFields("student"))).not.toContain("g.phone");
    expect(supplierContactColumns(viewerFields("admin"))).toBe("s.phone, s.email");
    const hidden = supplierContactColumns(viewerFields("student"));
    expect(hidden).not.toContain("s.phone");
    expect(hidden).not.toContain("s.email");
  });
  it("laat de kolommen weg op papier", () => {
    expect(guestHeadings(viewerFields("student"))).not.toContain("Mobiel");
    expect(guestHeadings(viewerFields("student"))).toContain("Allergieën / dieet");
    expect(guestHeadings(viewerFields("couple"))).toContain("Mobiel");
    expect(supplierHeadings(viewerFields("student"))).toEqual(["Categorie", "Leverancier", "Contact", "Aanwezig"]);
  });
});
