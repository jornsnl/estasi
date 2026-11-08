"use client";

import { useState } from "react";
import { sendGuestMail } from "@/app/actions/ws-mail";
import { SubmitButton } from "@/components/SubmitButton";
import { guestMailText } from "@/lib/ws/mail-format";

interface Recipient {
  id: string;
  firstName: string;
  name: string;
  email: string;
}

/** Feedback 5.6: the mail window. Aan is filled in, the closing is fixed and always shown. */
export function MailComposer({ coupleId, recipients, closing, from, replyTo }: { coupleId: string; recipients: Recipient[]; closing: string; from: string; replyTo: string }) {
  const [list, setList] = useState(recipients);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const withEmail = list.filter((r) => r.email);
  const sample = withEmail[0] ?? list[0];

  return (
    <form
      action={sendGuestMail}
      onSubmit={(e) => {
        if (withEmail.length > 1 && !confirm(`${withEmail.length} losse mails versturen?`)) e.preventDefault();
      }}
      className="grid gap-6 lg:grid-cols-2"
    >
      <input type="hidden" name="coupleId" value={coupleId} />
      {withEmail.map((r) => <input key={r.id} type="hidden" name="guestId" value={r.id} />)}
      <div className="card space-y-4 p-5">
        <div>
          <p className="label">Aan</p>
          <ul className="flex flex-wrap gap-1.5">
            {list.map((r) => (
              <li key={r.id} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${r.email ? "bg-cream-deep" : "bg-bordeaux-soft text-bordeaux"}`}>
                <span>{r.name} {r.email ? <span className="text-muted">&lt;{r.email}&gt;</span> : "(geen e-mailadres)"}</span>
                {list.length > 1 && (
                  <button type="button" onClick={() => setList((l) => l.filter((x) => x.id !== r.id))} className="ml-0.5 text-muted hover:text-bordeaux" aria-label={`${r.name} weghalen`}>×</button>
                )}
              </li>
            ))}
          </ul>
          {withEmail.length > 1 && <p className="mt-1 text-xs text-muted">Elke gast krijgt een eigen mail en ziet de andere adressen niet.</p>}
        </div>
        <div>
          <label className="label" htmlFor="subject">Onderwerp</label>
          <input id="subject" name="subject" required maxLength={300} value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="message">Bericht</label>
          <textarea id="message" name="message" required rows={10} value={message} onChange={(e) => setMessage(e.target.value)} className="input" placeholder={"Lieve [voornaam],\n\n…"} />
          <p className="mt-1 text-xs text-muted">[voornaam] wordt per gast ingevuld. De afsluiting hieronder komt er altijd onder.</p>
        </div>
        <div>
          <p className="label">Vaste afsluiting</p>
          <p className="rounded-lg border border-line bg-cream px-3 py-2 text-sm whitespace-pre-line text-muted">{closing}</p>
        </div>
        <SubmitButton className="btn-primary" pendingText="Versturen…">
          {withEmail.length === 1 ? "Mail versturen" : `${withEmail.length} mails versturen`}
        </SubmitButton>
      </div>

      <section aria-label="Voorbeeld" className="space-y-2">
        <p className="label">Voorbeeld{sample && withEmail.length > 1 ? ` (voor ${sample.firstName || sample.name})` : ""}</p>
        <div className="card overflow-hidden">
          <dl className="space-y-0.5 border-b border-line bg-cream/60 px-4 py-3 text-xs text-muted">
            <div><dt className="inline">Van: </dt><dd className="inline">{from}</dd></div>
            <div><dt className="inline">Antwoorden naar: </dt><dd className="inline">{replyTo}</dd></div>
            <div><dt className="inline">Aan: </dt><dd className="inline">{sample?.email || "–"}</dd></div>
            <div><dt className="inline">Onderwerp: </dt><dd className="inline font-medium text-ink">{subject || "(nog geen onderwerp)"}</dd></div>
          </dl>
          <div className="px-4 py-4 text-[15px] leading-relaxed whitespace-pre-line">
            {guestMailText(message || "(nog geen bericht)", closing, sample?.firstName ?? "")}
          </div>
          <p className="px-4 pb-4 text-xs text-muted">Your Wedding Space · Estasi Weddings</p>
        </div>
      </section>
    </form>
  );
}
