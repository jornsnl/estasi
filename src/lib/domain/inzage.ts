import { escapeHtml, EXPORT_STYLE } from "./portfolio";

/**
 * The export of everything the Academy keeps about one person (Academy 16,
 * a request for access under the AVG). Pure: which tables go in, how secrets
 * are left out and the readable overview. The queries are in
 * src/lib/data/privacy.ts.
 */

export interface InzageSection {
  key: string;
  title: string;
  /** What this is, in plain Dutch, for the person who reads the export. */
  description: string;
  rows: Record<string, unknown>[];
}

/** Every section of the export, in this order. The server fills the rows. */
export const INZAGE_SECTIONS: { key: string; title: string; description: string }[] = [
  { key: "account", title: "Account", description: "Naam, e-mailadres, rol, wanneer het account is gemaakt en geactiveerd en wanneer je voor het laatst actief was." },
  { key: "profiel", title: "Profiel", description: "De gegevens van je profiel (telefoon, woonplaats, bedrijfsnaam, socials, introductie, doelen, profielfoto)." },
  { key: "inschrijving", title: "Inschrijving en toegang", description: "Pakket, aankoopdatum, einddatum, pauzes, afronding, certificaat en de interne notities van Sabine." },
  { key: "toegangsmeldingen", title: "Meldingen over het einde van de toegang", description: "Wanneer de mail 30 of 7 dagen voor het einde van de toegang is verstuurd." },
  { key: "opdrachten", title: "Opdrachten", description: "Per opdracht de status, het laatst opgeslagen concept en een eventuele vraag aan Sabine." },
  { key: "versies", title: "Ingediende versies", description: "Een vaste kopie van elke ingediende versie: de vragen zoals ze toen waren en de antwoorden." },
  { key: "feedback", title: "Feedback op opdrachten", description: "Feedback van Sabine per versie, ook concepten die nog niet zijn verstuurd." },
  { key: "oude_antwoorden", title: "Antwoorden uit de eerste versie van de Academy", description: "Antwoorden en feedback van vóór de opdrachten (worden niet meer gebruikt, wel bewaard)." },
  { key: "oude_feedback", title: "Feedback uit de eerste versie van de Academy", description: "" },
  { key: "afgeronde_lessen", title: "Afgeronde lessen", description: "Welke lessen wanneer zijn afgerond." },
  { key: "vrijgaven", title: "Handmatig vrijgegeven modules", description: "" },
  { key: "community_berichten", title: "Community: berichten", description: "Berichten die je in de community hebt geplaatst." },
  { key: "community_reacties", title: "Community: reacties", description: "Reacties die je in de community hebt geplaatst." },
  { key: "community_meldingen", title: "Community: meldingen", description: "Berichten of reacties die je bij Sabine hebt gemeld." },
  { key: "privéberichten", title: "Privéberichten", description: "Het privégesprek tussen jou en Sabine." },
  { key: "bijlagen", title: "Bijlagen in community en privéberichten", description: "" },
  { key: "meldingsinstellingen", title: "Meldingsinstellingen", description: "Mail aan of uit en wanneer er voor het laatst een mail is gestuurd." },
  { key: "pushmeldingen", title: "Pushmeldingen", description: "Apparaten waarop pushmeldingen aan staan (zonder de sleutels)." },
  { key: "bestanden", title: "Bestanden", description: "Alle bestanden die bij jou horen. De bestanden zelf staan in de map bestanden." },
  { key: "meekijken", title: "Meelopen bij een bruiloft", description: "Leestoegang tot het draaiboek van een bruidspaar, met de momenten waarop je het hebt bekeken." },
  { key: "mails", title: "Verstuurde mails", description: "Mails die de app naar je heeft gestuurd." },
  { key: "logboek", title: "Logboek", description: "Wat Sabine in het beheer aan je account heeft gewijzigd." },
  { key: "beveiliging", title: "Beveiliging", description: "Passkeys en koppelingen (zonder sleutels of codes)." },
];

/** Columns that hold keys, hashes or the bytes of a file: never in an export. */
const SECRET = /(hash|secret|token|p256dh|public_key|challenge|^auth$|^data$|^code)/i;

export function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !SECRET.test(key)));
}

const cell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value, null, 1);
  return String(value);
};

/** A readable page with every section as a table; gegevens.json holds the same data. */
export function inzageHtml(sections: InzageSection[], options: { name: string; generatedAt: string; formatDate: (iso: string) => string }): string {
  const body = sections
    .map((s) => {
      const columns = [...new Set(s.rows.flatMap((r) => Object.keys(r)))];
      const table =
        s.rows.length === 0
          ? '<p class="empty">Niets opgeslagen.</p>'
          : `<div style="overflow-x:auto"><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${s.rows
              .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(cell(r[c])).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`)
              .join("")}</tbody></table></div>`;
      return `<h2>${escapeHtml(s.title)}</h2>${s.description ? `<p class="meta">${escapeHtml(s.description)}</p>` : ""}${table}`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gegevens ${escapeHtml(options.name)} · Wedding Plan Academy</title><style>${EXPORT_STYLE}</style></head>
<body><main>
<p class="meta">Wedding Plan Academy · Estasi Weddings</p>
<h1>Opgeslagen gegevens van ${escapeHtml(options.name)}</h1>
<p class="meta">Gemaakt op ${escapeHtml(options.formatDate(options.generatedAt))}. Dit is alles wat de Academy over deze persoon bewaart. De opdrachten staan leesbaar in portfolio.html, alle gegevens ook in gegevens.json en de bestanden in de map bestanden.</p>
${body}
</main></body></html>`;
}
