const dateFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

const dateTimeFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

export const formatDate = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : "–");

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTimeFormat.format(new Date(iso)) : "–";

/** yyyy-mm-dd for <input type="date">. */
export const toDateInput = (iso: string) => iso.slice(0, 10);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
