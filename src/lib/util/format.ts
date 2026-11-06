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

export const TIME_ZONE = "Europe/Amsterdam";

const dateInputFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

/**
 * yyyy-mm-dd for <input type="date">, as the calendar day in Amsterdam. The
 * screens show dates in Amsterdam time, so the date field must as well (a UTC
 * slice is a day off for anything stored between 22:00 and 24:00 UTC).
 */
export const toDateInput = (iso: string) => dateInputFormat.format(new Date(iso));

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

/** Milliseconds Amsterdam is ahead of UTC at the given moment (1 or 2 hours). */
function amsterdamOffset(ms: number): number {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return local - Math.floor(ms / 1000) * 1000;
}

/**
 * A date from <input type="date"> plus a clock time in Amsterdam, as an ISO
 * string in UTC. Returns null for anything that is not a real yyyy-mm-dd.
 */
export function fromDateInput(date: string, time = "12:00"): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const guess = Date.UTC(y, m - 1, d, Number(clock[1]), Number(clock[2]));
  const check = new Date(guess);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  // Two passes so a moment right next to a daylight saving switch still lands correctly.
  let ms = guess - amsterdamOffset(guess);
  ms = guess - amsterdamOffset(ms);
  return new Date(ms).toISOString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
