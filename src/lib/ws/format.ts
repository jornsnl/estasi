import type { Couple, Lane } from "@/lib/ws/types";

const TZ = "Europe/Amsterdam";

/** Today as YYYY-MM-DD in Dutch time. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days from today until the wedding; negative once it has passed. */
export function daysUntil(date: string, today = todayIso()): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function countdownLabel(date: string | null, today = todayIso()): string | null {
  if (!date) return null;
  const days = daysUntil(date, today);
  if (days > 1) return `${days} dagen`;
  if (days === 1) return "Morgen";
  if (days === 0) return "Vandaag";
  return null;
}

export function formatDate(date: string | Date | null | undefined, withYear = true): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date;
  return new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "–";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** "1.250,50", "1250.5", "€ 1250" and "" (null) all parse; anything else is an error. */
export function parseMoney(input: string): number | null {
  const raw = input.replace(/[€\s]/g, "");
  if (!raw) return null;
  // Dutch notation: dots for thousands, comma for cents. Accept a lone dot as decimal point too.
  const normalised = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) throw new Error(`"${input}" is geen geldig bedrag.`);
  return Math.round(Number(normalised) * 100);
}

export const LANES: Lane[] = ["couple", "sabine", "bride", "groom"];

export const LANE_LABELS: Record<Lane, string> = {
  couple: "Bruidspaar",
  sabine: "Sabine",
  bride: "Bruid",
  groom: "Bruidegom",
};

/** "Carlijn & Thom". */
export function coupleName(c: Pick<Couple, "partner1_first" | "partner2_first">): string {
  return [c.partner1_first, c.partner2_first].filter((x) => x.trim()).join(" & ");
}

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
