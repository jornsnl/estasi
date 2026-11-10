import { INTERESTS, INTEREST_LABELS, SOURCES, SOURCE_LABELS } from "@/lib/pipeline/rules";
import type { Lead } from "@/lib/pipeline/server";

const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : String(cents / 100).replace(".", ","));

/** The fields of a lead, shared by "Nieuwe lead" and the lead page. */
export function LeadFields({ lead, compact = false }: { lead?: Lead; compact?: boolean }) {
  const field = (id: string, label: string, input: React.ReactNode, wide = false) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label className="label" htmlFor={id}>{label}</label>
      {input}
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("title", "Naam op de kaart", <input id="title" name="title" required defaultValue={lead?.title ?? ""} placeholder="Bijv. Lisa & Tom" className="input" autoFocus={!lead} />, true)}
      {field("contactName", "Contactpersoon", <input id="contactName" name="contactName" defaultValue={lead?.contact_name ?? ""} className="input" />)}
      {field("partnerName", "Partner", <input id="partnerName" name="partnerName" defaultValue={lead?.partner_name ?? ""} className="input" />)}
      {field("email", "E-mail", <input id="email" name="email" type="email" defaultValue={lead?.email ?? ""} className="input" />)}
      {field("phone", "Telefoon", <input id="phone" name="phone" type="tel" defaultValue={lead?.phone ?? ""} className="input" />)}
      {field(
        "interest",
        "Interesse",
        <select id="interest" name="interest" defaultValue={lead?.interest ?? "weddingplanning"} className="input">
          {INTERESTS.map((i) => <option key={i} value={i}>{INTEREST_LABELS[i]}</option>)}
        </select>,
      )}
      {field(
        "source",
        "Bron",
        <select id="source" name="source" defaultValue={lead?.source ?? "handmatig"} className="input">
          {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>,
      )}
      {field("weddingDate", "Trouwdatum", <input id="weddingDate" name="weddingDate" type="date" defaultValue={lead?.wedding_date ?? ""} className="input" />)}
      {field("location", "Trouwlocatie", <input id="location" name="location" defaultValue={lead?.location ?? ""} className="input" />)}
      {field("guests", "Aantal gasten", <input id="guests" name="guests" type="number" min={0} max={5000} defaultValue={lead?.guests ?? ""} className="input" />)}
      {field("value", "Verwachte waarde (€, excl. btw)", <input id="value" name="value" inputMode="decimal" defaultValue={money(lead?.value_cents)} className="input" />)}
      {!compact && (
        <>
          {field("probability", "Kans (%)", <input id="probability" name="probability" inputMode="numeric" defaultValue={lead?.probability ?? ""} placeholder="Leeg = standaard per fase" className="input" />)}
          {field("nextActionDate", "Volgende stap op", <input id="nextActionDate" name="nextActionDate" type="date" defaultValue={lead?.next_action_date ?? ""} className="input" />)}
          {field("nextAction", "Volgende stap", <input id="nextAction" name="nextAction" defaultValue={lead?.next_action ?? ""} placeholder="Bijv. bellen over de offerte" className="input" />, true)}
          {lead?.stage === "afgevallen" &&
            field("lostReason", "Reden afgevallen", <input id="lostReason" name="lostReason" defaultValue={lead.lost_reason} className="input" />, true)}
        </>
      )}
      {field("notes", "Notities", <textarea id="notes" name="notes" rows={compact ? 2 : 4} defaultValue={lead?.notes ?? ""} className="input" />, true)}
    </div>
  );
}
