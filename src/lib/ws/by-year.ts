/**
 * The couples overview grouped per wedding year (feedback: 2026, 2027, 2028...),
 * each year sorted by date, years in order; couples without a date last.
 */
export function groupByWeddingYear<T extends { wedding_date: string | Date | null }>(rows: T[]): { year: string; rows: T[] }[] {
  const iso = (d: string | Date | null): string => (d instanceof Date ? d.toISOString().slice(0, 10) : d ?? "");
  const groups = new Map<string, T[]>();
  for (const row of [...rows].sort((a, b) => (iso(a.wedding_date) || "9999").localeCompare(iso(b.wedding_date) || "9999"))) {
    const year = iso(row.wedding_date).slice(0, 4) || "Nog geen datum";
    groups.set(year, [...(groups.get(year) ?? []), row]);
  }
  return [...groups.entries()].map(([year, list]) => ({ year, rows: list }));
}
