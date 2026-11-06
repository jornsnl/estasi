// Shared rules for form input: the forms use the same limits as maxLength, so
// a text is never cut off without the user seeing it.

export const LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  city: 120,
  companyName: 160,
  social: 300,
  intro: 5000,
  ownerNotes: 10_000,
  feedback: 10_000,
  answer: 20_000,
  moduleTitle: 200,
  moduleDescription: 2000,
  lessonTitle: 200,
  lessonSummary: 1000,
  url: 2000,
  caption: 500,
  downloadLabel: 300,
  downloadDescription: 1000,
  prompt: 5000,
  helpText: 3000,
  options: 5000,
  markdown: 50_000,
  welcomeText: 5000,
  contactEmail: 200,
  practicalSpotsNote: 2000,
  privacyNotice: 5000,
} as const;

/**
 * Links as people type them: "vimeo.com/123" or "www.site.nl" get https://
 * in front, so a missing scheme never blocks saving a form. Only web and
 * mail links are kept as they are.
 */
export function normaliseUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";
  if (/^(https?:\/\/|mailto:)/i.test(url) || url.startsWith("/")) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}
