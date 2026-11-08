/**
 * Meelopende cursist (feedback 13): the state of a student's read access to
 * a couple's run sheet. Free of server imports so it is unit tested.
 */
import { todayIso } from "./format";

export type StoredAccessStatus = "pending" | "active" | "declined" | "revoked";
export type AccessState = "wacht" | "actief" | "afgewezen" | "ingetrokken" | "verlopen";

/** The access ends this many days after the wedding date (13.4). */
export const DAYS_AFTER_WEDDING = 7;

/** The last day the student can open the run sheet ("YYYY-MM-DD"), or null without a wedding date. */
export function lastDay(weddingDate: string | null | undefined): string | null {
  if (!weddingDate || !/^\d{4}-\d{2}-\d{2}/.test(weddingDate)) return null;
  const d = new Date(`${weddingDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + DAYS_AFTER_WEDDING);
  return d.toISOString().slice(0, 10);
}

/**
 * The state, worked out on every request (no cron): a request or access
 * that is still open turns "verlopen" once the last day has passed. A
 * decline or revoke stays what it was. Without a wedding date nothing
 * expires yet.
 */
export function accessState(
  row: { status: StoredAccessStatus },
  weddingDate: string | null | undefined,
  today: string = todayIso(),
): AccessState {
  if (row.status === "declined") return "afgewezen";
  if (row.status === "revoked") return "ingetrokken";
  const last = lastDay(weddingDate);
  if (last && today > last) return "verlopen";
  return row.status === "active" ? "actief" : "wacht";
}

/** Only this state opens the run sheet. */
export const canView = (state: AccessState) => state === "actief";

/** An open request the couple can still answer. */
export const awaitsCouple = (state: AccessState) => state === "wacht";

/** What Sabine sees in the block at the couple. */
export function stateLabel(state: AccessState, revokedBy?: "admin" | "couple" | null): string {
  switch (state) {
    case "wacht":
      return "Wacht op akkoord bruidspaar";
    case "actief":
      return "Actief";
    case "afgewezen":
      return "Afgewezen door bruidspaar";
    case "ingetrokken":
      return revokedBy === "couple" ? "Ingetrokken door bruidspaar" : revokedBy === "admin" ? "Ingetrokken door Sabine" : "Ingetrokken";
    case "verlopen":
      return "Verlopen";
  }
}

export const STATE_TONES: Record<AccessState, "gold" | "success" | "neutral" | "bordeaux"> = {
  wacht: "gold",
  actief: "success",
  afgewezen: "bordeaux",
  ingetrokken: "neutral",
  verlopen: "neutral",
};

/** The confirmation Sabine ticks before the request goes out (13.1). */
export const GRANT_CONFIRMATION = "Ik geef deze cursist leestoegang tot het draaiboek, onder voorbehoud van akkoord van het bruidspaar.";

/** The question on the couple's start page and in their mail (13.2), with the line about allergies. */
export function consentQuestion(studentName: string): string[] {
  const name = studentName.trim() || "een cursist";
  return [
    `Sabine wil graag dat ${name}, cursist van de Estasi Academy, met haar meeloopt op jullie bruiloft. Daarvoor heeft ${name} leestoegang nodig tot jullie draaiboek. ${name} kan alleen meekijken en niets aanpassen. Geven jullie hier toestemming voor?`,
    `${name} ziet dan ook de allergieën en dieetwensen per gast, omdat die op de dag zelf nodig zijn. Adressen, telefoonnummers en e-mailadressen van jullie gasten, de kosten en de speeches blijven verborgen.`,
  ];
}

/** "Draaiboek Estelle en Yannick" for the student's button (13.3). */
export function draaiboekTitle(c: { partner1_first: string; partner2_first: string }): string {
  const names = [c.partner1_first, c.partner2_first].map((n) => n.trim()).filter(Boolean);
  return `Draaiboek ${names.join(" en ") || "bruidspaar"}`;
}

/** Whether an Academy enrollment may walk along: package B with access that is active now. */
export function eligibleStudent(
  enrollment: { package: string; revokedAt: string | null; pausedAt: string | null; endsAt: string } | null,
  now = new Date(),
): boolean {
  if (!enrollment || enrollment.package !== "B") return false;
  if (enrollment.revokedAt || enrollment.pausedAt) return false;
  return new Date(enrollment.endsAt).getTime() > now.getTime();
}
