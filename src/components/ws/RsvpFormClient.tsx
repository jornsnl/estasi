"use client";

import { useMemo, useState } from "react";
import { submitRsvp } from "@/app/actions/rsvp";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { isQuestionVisible } from "@/lib/ws/pure";

export interface PublicQuestion {
  id: string;
  label: string;
  help: string;
  kind: "short" | "long" | "single" | "multi" | "yesno" | "number";
  required: boolean;
  options: string[];
  max_choices: number | null;
  show_if_question_id: string | null;
  show_if_value: string;
}

interface Props {
  slug: string;
  relations: string[];
  maxRelations: number;
  askPartOfDay: boolean;
  askDiet: boolean;
  askDresscode: boolean;
  dresscode: string;
  dresscodeNote: string;
  questions: PublicQuestion[];
}

const Req = () => <span className="text-bordeaux" aria-hidden="true"> *</span>;
const choice = "flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2";

/** The public RSVP form: no login, works on a phone. */
export function RsvpFormClient(p: Props) {
  const [attending, setAttending] = useState("");
  const [count, setCount] = useState(1);
  const [relations, setRelations] = useState<string[]>([]);
  // Feedback Sabine (13): with "Deel van de dag", every other person of the sign up says it too.
  const [partyAttendance, setPartyAttendance] = useState<Record<number, "partial" | "yes">>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const coming = attending === "yes" || attending === "partial";
  const visible = useMemo(() => p.questions.filter((q) => isQuestionVisible(q, p.questions, answers)), [p.questions, answers]);
  const set = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));

  return (
    <form action={submitRsvp} className="space-y-5">
      <input type="hidden" name="slug" value={p.slug} />
      {/* Honeypot: people never see or fill this. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="firstName">Voornaam<Req /></label><input id="firstName" name="firstName" required autoComplete="given-name" className="input" /></div>
        <div><label className="label" htmlFor="lastName">Achternaam<Req /></label><input id="lastName" name="lastName" required autoComplete="family-name" className="input" /></div>
        <div><label className="label" htmlFor="email">E-mail<Req /></label><input id="email" name="email" type="email" required autoComplete="email" className="input" /></div>
        <div><label className="label" htmlFor="phone">Telefoonnummer<Req /></label><input id="phone" name="phone" type="tel" required autoComplete="tel" className="input" /></div>
      </div>

      <fieldset>
        <legend className="label">Relatie tot het bruidspaar<Req /> <span className="font-normal text-muted">(maximaal {p.maxRelations})</span></legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {p.relations.map((r) => {
            const checked = relations.includes(r);
            return (
              <label key={r} className={`${choice} ${!checked && relations.length >= p.maxRelations ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  name="relation"
                  value={r}
                  checked={checked}
                  disabled={!checked && relations.length >= p.maxRelations}
                  onChange={(e) => setRelations((list) => (e.target.checked ? [...list, r] : list.filter((x) => x !== r)))}
                  className="accent-[#6B1E2E]"
                />
                <span className="text-sm">{r}</span>
              </label>
            );
          })}
        </div>
        {relations.includes("Anders") && <input name="relationOther" aria-label="Anders, namelijk" placeholder="Anders, namelijk…" className="input mt-2" />}
      </fieldset>

      <fieldset>
        <legend className="label">Aanwezigheid<Req /></legend>
        <div className="flex flex-wrap gap-2 text-sm">
          <label className={choice}><input type="radio" name="attending" value="yes" required onChange={() => setAttending("yes")} className="accent-[#6B1E2E]" /> Aanwezig</label>
          {p.askPartOfDay && <label className={choice}><input type="radio" name="attending" value="partial" onChange={() => setAttending("partial")} className="accent-[#6B1E2E]" /> Deel van de dag</label>}
          <label className={choice}><input type="radio" name="attending" value="no" onChange={() => setAttending("no")} className="accent-[#6B1E2E]" /> Afwezig</label>
        </div>
        {attending === "partial" && (
          <div className="mt-3">
            <label className="label" htmlFor="partialNote">Beschrijf hier welke tijden je aanwezig bent<Req /></label>
            <input id="partialNote" name="partialNote" required className="input" />
          </div>
        )}
      </fieldset>

      {coming && (
        <>
          <div>
            <label className="label" htmlFor="partyCount">Aantal personen (inclusief jijzelf)<Req /></label>
            <input
              id="partyCount"
              name="partyCount"
              type="number"
              min={1}
              max={12}
              required
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
              className="input w-28"
            />
          </div>
          {p.askDiet && (
            <div>
              <label className="label" htmlFor="diet">Jouw dieetwensen en allergieën</label>
              <input id="diet" name="diet" placeholder="Bijvoorbeeld: vegetarisch, notenallergie" className="input" />
            </div>
          )}
          {count > 1 && (
            <fieldset className="space-y-3">
              <legend className="label">Namen van de andere gasten</legend>
              {Array.from({ length: count - 1 }, (_, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-cream p-3 sm:grid-cols-[1fr_auto]">
                  <input name={`party_${i}_name`} required placeholder={`Voor- en achternaam gast ${i + 2}`} aria-label={`Naam gast ${i + 2}`} className="input" />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`party_${i}_kid`} className="accent-[#6B1E2E]" /> Kind</label>
                  {p.askDiet && (
                    <input name={`party_${i}_diet`} placeholder="Dieetwensen en allergieën" aria-label={`Dieetwensen gast ${i + 2}`} className="input sm:col-span-2" />
                  )}
                  {attending === "partial" && (
                    <fieldset className="space-y-2 sm:col-span-2">
                      <legend className="mb-1 text-sm font-medium">Aanwezigheid gast {i + 2}<Req /></legend>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <label className={choice}>
                          <input type="radio" name={`party_${i}_attendance`} value="partial" required checked={partyAttendance[i] === "partial"} onChange={() => setPartyAttendance((a) => ({ ...a, [i]: "partial" }))} className="accent-[#6B1E2E]" /> Deel van de dag
                        </label>
                        <label className={choice}>
                          <input type="radio" name={`party_${i}_attendance`} value="yes" checked={partyAttendance[i] === "yes"} onChange={() => setPartyAttendance((a) => ({ ...a, [i]: "yes" }))} className="accent-[#6B1E2E]" /> Aanwezig
                        </label>
                      </div>
                      {partyAttendance[i] === "partial" && (
                        <div>
                          <label className="label" htmlFor={`party_${i}_partialNote`}>Beschrijf hier welke tijden je aanwezig bent<Req /></label>
                          <input id={`party_${i}_partialNote`} name={`party_${i}_partialNote`} required className="input" />
                        </div>
                      )}
                    </fieldset>
                  )}
                </div>
              ))}
            </fieldset>
          )}
          {p.askDresscode && (
            <fieldset>
              <legend className="label">Dresscode: {p.dresscode}<Req /></legend>
              {p.dresscodeNote && <p className="mb-2 text-sm whitespace-pre-line text-muted">{p.dresscodeNote}</p>}
              <div className="flex flex-wrap gap-2 text-sm">
                <label className={choice}><input type="radio" name="dresscodeOk" value="yes" required className="accent-[#6B1E2E]" /> Ja</label>
                <label className={choice}><input type="radio" name="dresscodeOk" value="no" className="accent-[#6B1E2E]" /> Nee, ik ontvang graag meer informatie</label>
              </div>
            </fieldset>
          )}
        </>
      )}

      {visible.map((q) => (
        <Question key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
      ))}

      <SubmitButton className="btn-primary w-full" pendingText="Versturen…">Versturen</SubmitButton>
    </form>
  );
}

function Question({ q, value, onChange }: { q: PublicQuestion; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const name = `q-${q.id}`;
  const label = (
    <>
      {q.label}
      {q.required && <Req />}
    </>
  );
  const help = q.help ? <p className="mb-1.5 text-xs text-muted">{q.help}</p> : null;
  if (q.kind === "single" || q.kind === "yesno") {
    const options = q.kind === "yesno" ? ["Ja", "Nee"] : q.options;
    return (
      <fieldset>
        <legend className="label">{label}</legend>
        {help}
        <div className="flex flex-wrap gap-2 text-sm">
          {options.map((o) => (
            <label key={o} className={choice}>
              <input type="radio" name={name} value={o} required={q.required} checked={value === o} onChange={() => onChange(o)} className="accent-[#6B1E2E]" /> {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (q.kind === "multi") {
    const chosen = Array.isArray(value) ? value : [];
    const max = q.max_choices ?? q.options.length;
    return (
      <fieldset>
        <legend className="label">{label}{max < q.options.length && <span className="font-normal text-muted"> (maximaal {max})</span>}</legend>
        {help}
        <div className="grid gap-1.5 sm:grid-cols-2">
          {q.options.map((o) => {
            const on = chosen.includes(o);
            return (
              <label key={o} className={`${choice} text-sm ${!on && chosen.length >= max ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  name={name}
                  value={o}
                  checked={on}
                  disabled={!on && chosen.length >= max}
                  onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))}
                  className="accent-[#6B1E2E]"
                />
                {o}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {help}
      {q.kind === "long" ? (
        <AutoTextarea id={name} name={name} required={q.required} onChange={(e) => onChange(e.target.value)} className="input min-h-20" />
      ) : (
        <input id={name} name={name} type={q.kind === "number" ? "number" : "text"} required={q.required} onChange={(e) => onChange(e.target.value)} className="input" />
      )}
    </div>
  );
}
