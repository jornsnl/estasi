/**
 * The month calendar of Beheer, Agenda (feedback Sabine): which dates are already taken, at a
 * glance. Pure, so it is unit tested; weeks start on Monday, as in the Netherlands.
 */
export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** "2026-11" from the address, or the month of `today` when missing or wrong. */
export function parseMonth(value: string | undefined, today: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 2000 && Number(m[1]) <= 2100) return { year: Number(m[1]), month: Number(m[2]) };
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export const monthKey = (year: number, month: number) => `${year}-${pad(month)}`;

/** The month before and after, as "YYYY-MM". */
export function neighbours(year: number, month: number): { prev: string; next: string } {
  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
  return { prev, next };
}

/** Whole weeks, Monday to Sunday, around the month; days of the months next to it have inMonth false. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday 0 ... Sunday 6
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const last = new Date(Date.UTC(year, month, 0));
  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  while (cursor <= last || weeks.length === 0 || weeks.at(-1)!.length < 7) {
    if (weeks.length === 0 || weeks.at(-1)!.length === 7) {
      if (cursor > last) break;
      weeks.push([]);
    }
    weeks.at(-1)!.push({ date: iso(cursor), day: cursor.getUTCDate(), inMonth: cursor.getUTCMonth() === month - 1 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weeks;
}

/** First and last date shown in the grid, for the query. */
export function gridRange(weeks: CalendarDay[][]): { from: string; to: string } {
  return { from: weeks[0][0].date, to: weeks.at(-1)!.at(-1)!.date };
}
