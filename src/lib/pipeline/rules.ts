// Salespipeline: the fixed lists, the forecast and the order on the board. Pure, so the
// browser can use it too and it is unit tested (tests/pipeline.test.ts). Queries live in
// server.ts, the beheer pages in src/app/beheer/pipeline/.

export const STAGES = ["nieuw", "contact", "kennismaking", "offerte", "geboekt", "afgevallen"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  nieuw: "Nieuw",
  contact: "Contact gehad",
  kennismaking: "Kennismaking gepland",
  offerte: "Offerte verstuurd",
  geboekt: "Geboekt",
  afgevallen: "Afgevallen",
};

/** Short explanation per stage, for empty columns and the MCP tools. */
export const STAGE_HINTS: Record<Stage, string> = {
  nieuw: "Net binnengekomen, nog niet benaderd.",
  contact: "Eerste contact gehad, nog geen afspraak.",
  kennismaking: "Er staat een kennismaking gepland.",
  offerte: "Offerte of voorstel verstuurd.",
  geboekt: "Gewonnen: het bruidspaar of de cursist heeft geboekt.",
  afgevallen: "Gaat niet door.",
};

/** Dot per stage, in the Estasi colours: from soft gold to bordeaux. */
export const STAGE_COLORS: Record<Stage, string> = {
  nieuw: "#d9cfa8",
  contact: "#a4914a",
  kennismaking: "#a5636b",
  offerte: "#722f37",
  geboekt: "#3f6b4a",
  afgevallen: "#c9c2b8",
};

export const OPEN_STAGES: Stage[] = ["nieuw", "contact", "kennismaking", "offerte"];
export const isClosed = (stage: Stage) => !OPEN_STAGES.includes(stage);

export const INTERESTS = ["weddingplanning", "ceremoniemeester", "openingsdans", "academy", "overig"] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  weddingplanning: "Weddingplanning",
  ceremoniemeester: "Ceremoniemeester",
  openingsdans: "Openingsdans",
  academy: "Academy",
  overig: "Overig",
};

export const SOURCES = ["website", "instagram", "meta_ads", "aanbeveling", "beurs", "mail", "handmatig", "overig"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  website: "Website",
  instagram: "Instagram",
  meta_ads: "Meta Ads",
  aanbeveling: "Via via",
  beurs: "Beurs",
  mail: "Mail",
  handmatig: "Handmatig",
  overig: "Overig",
};

const isOneOf = <T extends string>(list: readonly T[]) => (value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

export const isStage = isOneOf(STAGES);
export const isInterest = isOneOf(INTERESTS);
export const isSource = isOneOf(SOURCES);

/** Closed leads stay on the board this long. */
export const CLOSED_DAYS = 90;

/**
 * Chance per stage when a lead has none of its own. On purpose a bit careful;
 * fill in a chance per lead once you know more.
 */
export const DEFAULT_STAGE_PROBABILITY: Record<Stage, number> = {
  nieuw: 10,
  contact: 20,
  kennismaking: 40,
  offerte: 60,
  geboekt: 100,
  afgevallen: 0,
};

export interface ForecastLead {
  stage: Stage;
  value_cents: number | null;
  probability: number | null;
}

export interface ForecastRow {
  stage: Stage;
  count: number;
  /** Sum of the expected values, in cents. */
  value: number;
  /** Sum of value × chance, in cents. */
  weighted: number;
  /** Leads with a value but without an own chance (the default was used). */
  defaulted: number;
  /** Leads without a value: not counted in the amounts. */
  withoutValue: number;
}

export interface Forecast {
  rows: ForecastRow[];
  value: number;
  weighted: number;
  withoutValue: number;
}

/** Forecast for the open stages: per stage the sum of value × chance (all in cents). */
export function forecast(leads: ForecastLead[]): Forecast {
  const rows: ForecastRow[] = OPEN_STAGES.map((stage) => ({ stage, count: 0, value: 0, weighted: 0, defaulted: 0, withoutValue: 0 }));
  const byStage = new Map(rows.map((r) => [r.stage, r]));
  for (const lead of leads) {
    const row = byStage.get(lead.stage);
    if (!row) continue;
    row.count += 1;
    const value = lead.value_cents === null || lead.value_cents === undefined ? null : Number(lead.value_cents);
    if (value === null || !Number.isFinite(value) || value <= 0) {
      row.withoutValue += 1;
      continue;
    }
    const own = lead.probability === null || lead.probability === undefined ? null : Number(lead.probability);
    const chance = own === null || !Number.isFinite(own) ? DEFAULT_STAGE_PROBABILITY[lead.stage] : Math.min(100, Math.max(0, own));
    if (own === null) row.defaulted += 1;
    row.value += value;
    row.weighted += (value * chance) / 100;
  }
  for (const r of rows) r.weighted = Math.round(r.weighted);
  return {
    rows,
    value: rows.reduce((s, r) => s + r.value, 0),
    weighted: rows.reduce((s, r) => s + r.weighted, 0),
    withoutValue: rows.reduce((s, r) => s + r.withoutValue, 0),
  };
}

const STEP = 1000;

/**
 * Fractional indexing: a position between two neighbours, so a move only
 * updates one row. `null` means: no neighbour on that side.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return STEP;
  if (before === null) return (after as number) - STEP;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

/** The position for a lead dropped at `index` in a column (the lead itself left out of `others`). */
export function positionAt(others: number[], index: number): number {
  const sorted = [...others].sort((a, b) => a - b);
  const i = Math.max(0, Math.min(index, sorted.length));
  return positionBetween(i > 0 ? sorted[i - 1] : null, i < sorted.length ? sorted[i] : null);
}

/** Follow-up due today or earlier, for open leads only (the count in the menu). */
export function followUpDue(lead: { stage: Stage; next_action_date: string | null }, today: string): boolean {
  return !isClosed(lead.stage) && lead.next_action_date !== null && lead.next_action_date <= today;
}

/** "45" or "45%" or "" to a chance between 0 and 100, or null. */
export function parseProbability(input: string): number | null {
  const raw = input.replace(/[%\s]/g, "").replace(",", ".");
  if (!raw) return null;
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) throw new Error(`"${input}" is geen geldige kans.`);
  return Math.min(100, Math.max(0, value));
}

/** A link to the Instagram of a contact: as written when it is a link, otherwise from the @name. */
export function instagramUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : null;
}
