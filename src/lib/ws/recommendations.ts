/**
 * Pure helpers for "Aanraders van Estasi" and the suppliers page, shared by
 * server and browser code (no server imports here).
 */

/** "4 aanraders in fotograaf", "1 aanrader in bloemist". */
export function recommendationCount(count: number, category: string) {
  return `${count} ${count === 1 ? "aanrader" : "aanraders"} in ${category.toLocaleLowerCase("nl-NL")}`;
}

/** A website as typed by Sabine ("www.example.nl") as a link. */
export function websiteHref(url: string) {
  const clean = url.trim();
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

/** Instagram as an account ("@studio", "studio") or a full link, always as a link. */
export function instagramHref(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^(www\.)?instagram\.com\//i.test(clean)) return `https://${clean}`;
  const handle = clean.replace(/^@/, "").replace(/\/+$/, "");
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

/** How Instagram is shown: "@studio" for an account, the link without https:// otherwise. */
export function instagramLabel(value: string) {
  const href = instagramHref(value);
  if (!href) return "";
  const match = href.match(/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?$/i);
  return match ? `@${match[1]}` : href.replace(/^https?:\/\//i, "");
}

/** Phone number for a tel: link (spaces, dashes and brackets out). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** "Beroep · Regio", leaving out what is empty. */
export const professionAndRegion = (profession: string, region: string) =>
  [profession.trim(), region.trim()].filter(Boolean).join(" · ");

/** Statuses in which there is still a supplier to choose, so the recommendations are worth a look. */
export const STILL_CHOOSING = ["tbd", "favorite", "talking"] as const;

export interface SupplierRowLike {
  status: string;
  name: string;
}

/**
 * A category counts as filled in ("bolletje" in the quick menu) once a row in
 * it has a supplier name, or a status other than "Nog te bepalen".
 */
export const categoryFilled = (rows: SupplierRowLike[]) =>
  rows.some((r) => r.name.trim() !== "" || r.status !== "tbd");

/** The bordeaux bar to the recommendations: only with visible recommendations and while still choosing. */
export const showRecommendationBar = (rows: SupplierRowLike[], visibleRecommendations: number) =>
  visibleRecommendations > 0 && rows.some((r) => (STILL_CHOOSING as readonly string[]).includes(r.status));

/** Moves one id a place up or down within a list; returns the new order or null when it cannot move. */
export function moveInList(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
