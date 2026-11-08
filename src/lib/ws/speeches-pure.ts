/**
 * Speeches (feedback 12): labels and the sums shown above the list and on
 * the print. No server imports, so it is tested on its own.
 */

export const SPEECH_MOMENTS = {
  ceremonie: "Ceremonie",
  diner: "Diner (tussen gangen)",
  receptie: "Receptie",
  avond: "Avond",
  eigen: "Eigen invulling",
} as const;
export type SpeechMoment = keyof typeof SPEECH_MOMENTS;

export const SPEECH_NEEDS = {
  microfoon: "microfoon",
  beamer: "beamer/scherm",
  laptop: "laptop",
  muziek: "muziek of geluidsfragment",
  presentatie: "presentatie",
} as const;
export type SpeechNeed = keyof typeof SPEECH_NEEDS;

export const SPEECH_STATUS = {
  aangemeld: "Aangemeld",
  bevestigd: "Bevestigd",
  materiaal: "Materiaal ontvangen",
  techniek: "Technische check gedaan",
} as const;
export type SpeechStatus = keyof typeof SPEECH_STATUS;

export interface SpeechLike {
  planned_time: string;
  duration_minutes: number | null;
  needs: string[];
  needs_other: string;
  status: string;
  moment: string;
  moment_other: string;
}

export const isMoment = (v: unknown): v is SpeechMoment => typeof v === "string" && v in SPEECH_MOMENTS;
export const isNeed = (v: unknown): v is SpeechNeed => typeof v === "string" && v in SPEECH_NEEDS;
export const isSpeechStatus = (v: unknown): v is SpeechStatus => typeof v === "string" && v in SPEECH_STATUS;

/**
 * Not complete yet: no planned time, or still only "aangemeld" (not
 * confirmed). Marked subtly in the list and counted in the overview.
 */
export function incompleteReasons(s: Pick<SpeechLike, "planned_time" | "status">): string[] {
  const reasons: string[] = [];
  if (!s.planned_time.trim()) reasons.push("geen tijd");
  if (s.status === "aangemeld") reasons.push("nog niet bevestigd");
  return reasons;
}

export const isIncomplete = (s: Pick<SpeechLike, "planned_time" | "status">) => incompleteReasons(s).length > 0;

export const totalMinutes = (speeches: Pick<SpeechLike, "duration_minutes">[]) =>
  speeches.reduce((sum, s) => sum + (s.duration_minutes && s.duration_minutes > 0 ? s.duration_minutes : 0), 0);

/** "45 min", "1 uur", "1 uur 20 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} uur ${m} min` : `${h} uur`;
}

/** The own entries of a speech: "kaarsje, tafel; bloemen" gives ["kaarsje", "tafel", "bloemen"]. */
export const otherNeeds = (text: string) =>
  text
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

/** Everything one speech needs, as words: fixed ones in their fixed order, then the own entries. */
export function needsOf(s: Pick<SpeechLike, "needs" | "needs_other">): string[] {
  const fixed = (Object.keys(SPEECH_NEEDS) as SpeechNeed[]).filter((k) => s.needs.includes(k)).map((k) => SPEECH_NEEDS[k]);
  return [...fixed, ...otherNeeds(s.needs_other)];
}

/**
 * All needs together: [["microfoon", 2], ["beamer/scherm", 1]]. Fixed needs
 * first in their fixed order, then own entries in order of appearance; own
 * entries that differ only in capitals are counted as one.
 */
export function needsTotals(speeches: Pick<SpeechLike, "needs" | "needs_other">[]): [string, number][] {
  const counts = new Map<string, [string, number]>();
  for (const key of Object.keys(SPEECH_NEEDS) as SpeechNeed[]) {
    const n = speeches.filter((s) => s.needs.includes(key)).length;
    if (n) counts.set(SPEECH_NEEDS[key], [SPEECH_NEEDS[key], n]);
  }
  for (const s of speeches) {
    for (const item of new Set(otherNeeds(s.needs_other).map((t) => t.toLowerCase()))) {
      const existing = counts.get(item);
      if (existing) existing[1]++;
      else counts.set(item, [otherNeeds(s.needs_other).find((t) => t.toLowerCase() === item)!, 1]);
    }
  }
  return [...counts.values()];
}

/** "2x microfoon, 1x beamer/scherm", or "" without needs. */
export const needsSummary = (speeches: Pick<SpeechLike, "needs" | "needs_other">[]) =>
  needsTotals(speeches)
    .map(([label, n]) => `${n}x ${label}`)
    .join(", ");

export const momentLabel = (s: Pick<SpeechLike, "moment" | "moment_other">) =>
  s.moment === "eigen" ? s.moment_other.trim() || SPEECH_MOMENTS.eigen : isMoment(s.moment) ? SPEECH_MOMENTS[s.moment] : "";

/** "hh:mm" from what Sabine typed ("9.30", "21:05", "2015"), or null when it is no time. Empty stays empty. */
export function normalizeTime(input: string): string | null {
  const t = input.trim();
  if (!t) return "";
  const m = t.match(/^(\d{1,2})[:.,h]?(\d{2})?(?:\s*uur)?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Title of the print, and so the name of the PDF: "Speeches Anna en Bram". */
export const speechesTitle = (c: { partner1_first: string; partner2_first: string }) =>
  `Speeches ${[c.partner1_first, c.partner2_first].map((n) => n.trim()).filter(Boolean).join(" en ")}`.trim();

/**
 * The overview of all couples: the next wedding first, then couples without
 * a date, then weddings that have passed (most recent first).
 */
export function byNextWedding<T extends { wedding_date: string | null }>(couples: T[], today: string): T[] {
  const rank = (c: T) => (!c.wedding_date ? 1 : c.wedding_date >= today ? 0 : 2);
  return [...couples].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (!a.wedding_date || !b.wedding_date) return 0;
    return rank(a) === 0 ? a.wedding_date.localeCompare(b.wedding_date) : b.wedding_date.localeCompare(a.wedding_date);
  });
}
