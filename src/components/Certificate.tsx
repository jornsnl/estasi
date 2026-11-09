import { formatDate } from "@/lib/util/format";

/**
 * Printing a certificate: always A4 landscape without browser margins, so
 * "Opslaan als pdf" gives one full page without the student choosing anything.
 * Rendered only on pages that show a certificate.
 */
const PRINT_CSS = `
@page { size: A4 landscape; margin: 0; }
@media print {
  html, body { background: #ffffff !important; }
  .certificate-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** The Estasi monogram: a gold E in a bordeaux square with a fine gold rim, as in the mails. */
function Monogram() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-14 w-14 sm:h-16 sm:w-16 print:h-[18mm] print:w-[18mm]">
      <rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="#6b1e2e" stroke="#a89650" strokeWidth="1.5" />
      <rect x="6" y="6" width="52" height="52" rx="10.5" fill="none" stroke="#e8d9a8" strokeOpacity="0.45" strokeWidth="0.8" />
      <text x="32" y="44" textAnchor="middle" fontFamily="'Playfair Display','Cormorant Garamond',Georgia,serif" fontSize="34" fontWeight="600" fill="#e8d9a8">
        E
      </text>
    </svg>
  );
}

/** A small gold ornament between the parts of the certificate. */
function Ornament() {
  return (
    <div className="flex items-center justify-center gap-3 text-gold" aria-hidden="true">
      <span className="h-px w-12 bg-gold/60 sm:w-20" />
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor"><path d="M6 0 7.4 4.6 12 6 7.4 7.4 6 12 4.6 7.4 0 6 4.6 4.6z" /></svg>
      <span className="h-px w-12 bg-gold/60 sm:w-20" />
    </div>
  );
}

/** The certificate of the online part, or (kind "praktijk") of the practical part with the shadow wedding. */
export function Certificate({ name, date, code, kind = "online" }: { name: string; date: string; code: string; kind?: "online" | "praktijk" }) {
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="certificate-sheet mx-auto w-full max-w-4xl bg-white p-3 shadow-sm sm:aspect-[1.414] print:fixed print:inset-0 print:z-50 print:m-0 print:h-[210mm] print:w-[297mm] print:max-w-none print:p-[9mm] print:shadow-none">
        <div className="flex h-full flex-col items-center justify-center border-2 border-gold bg-[#fffdf8] p-8 text-center outline outline-1 outline-offset-4 outline-gold/50 sm:p-12 print:p-[14mm]">
          <Monogram />
          <p className="eyebrow mt-4">Estasi Weddings</p>
          <p className="mt-1 font-serif text-2xl text-gold-ink">Future Weddings Academy</p>
          <h1 className="mt-5 text-4xl sm:text-6xl">{kind === "praktijk" ? "Praktijkcertificaat" : "Certificaat"}</h1>
          <div className="mt-5"><Ornament /></div>
          <p className="mt-5 text-sm tracking-wide text-muted uppercase">uitgereikt aan</p>
          <p className="mt-2 font-serif text-3xl text-bordeaux sm:text-5xl">{name}</p>
          <p className="mt-5 max-w-lg text-muted">
            {kind === "praktijk"
              ? "voor het succesvol afronden van het praktijkdeel van de opleiding tot weddingplanner, met het meelopen op een bruiloft."
              : "voor het succesvol afronden van het online deel van de opleiding tot weddingplanner."}
          </p>
          <div className="mt-8 flex w-full max-w-lg items-end justify-between text-left text-sm">
            <div>
              <p className="font-serif text-2xl italic">Sabine</p>
              <p className="border-t border-gold/60 pt-1 text-muted">Opleider, Estasi Weddings</p>
            </div>
            <div className="text-right">
              <p>{formatDate(date)}</p>
              <p className="text-xs text-muted">Certificaatnummer {code}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
