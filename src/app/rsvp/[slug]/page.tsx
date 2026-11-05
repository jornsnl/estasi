import { submitRsvp } from "@/app/actions/rsvp";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { coupleName, formatDate } from "@/lib/ws/format";
import { publicForm, RELATIONS } from "@/lib/ws/rsvp";

export const dynamic = "force-dynamic";
export const metadata = { title: "RSVP", robots: { index: false, follow: false } };

/** The public RSVP page a guest opens from the invitation (link or QR code). No login. */
export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const found = await publicForm(slug);
  const thanks = (await searchParams).bedankt;

  if (!found) {
    return (
      <main className="ws-theme flex flex-col items-center px-4 pt-32 text-center">
        <h1 className="text-3xl">Dit formulier is niet (meer) beschikbaar</h1>
        <p className="mt-2 text-muted">Neem contact op met het bruidspaar.</p>
      </main>
    );
  }
  const { form, couple, questions } = found;
  const names = coupleName(couple);

  return (
    <main className="ws-theme px-4 py-10">
      <div className="mx-auto max-w-lg">
        <section
          className="relative mb-6 h-44 overflow-hidden rounded-2xl bg-cover bg-center"
          style={{
            backgroundImage: couple.cover_file_id
              ? `linear-gradient(0deg, rgba(44,44,44,0.55), rgba(44,44,44,0.1)), url(/rsvp/${form.slug}/cover)`
              : "linear-gradient(0deg, rgba(44,44,44,0.45), rgba(44,44,44,0.1)), linear-gradient(135deg, #A89650, #8a7838)",
          }}
        >
          <div className="absolute inset-x-0 bottom-5 text-center text-white">
            <p className="text-[11px] tracking-[0.2em] uppercase opacity-90">Jullie zijn uitgenodigd</p>
            <h1 className="mt-1 text-3xl text-white">{names}</h1>
            <p className="mt-1 text-sm opacity-90">{formatDate(couple.wedding_date)}{couple.location ? ` · ${couple.location}` : ""}</p>
          </div>
        </section>

        {thanks ? (
          <div className="card p-8 text-center">
            <h2 className="text-2xl">{thanks === "nee" ? "Bedankt voor het laten weten" : "Dank je wel!"}</h2>
            <p className="mt-2 text-muted">
              {thanks === "nee" ? "Jammer dat je er niet bij kunt zijn. Je antwoord is goed ontvangen." : "Je aanmelding is goed ontvangen. Je krijgt een bevestiging per e-mail."}
            </p>
          </div>
        ) : (
          <form action={submitRsvp} className="card space-y-4 p-6">
            <h2 className="text-xl">{form.name}</h2>
            {form.intro && <p className="text-sm whitespace-pre-line text-muted">{form.intro}</p>}
            <Notice searchParams={searchParams} />
            <input type="hidden" name="slug" value={form.slug} />
            {/* Honeypot: people never see or fill this. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="firstName">Voornaam</label><input id="firstName" name="firstName" required autoComplete="given-name" className="input" /></div>
              <div><label className="label" htmlFor="lastName">Achternaam</label><input id="lastName" name="lastName" autoComplete="family-name" className="input" /></div>
              <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" className="input" /></div>
              <div><label className="label" htmlFor="phone">Telefoon</label><input id="phone" name="phone" type="tel" autoComplete="tel" className="input" /></div>
            </div>
            <div>
              <label className="label" htmlFor="relation">Relatie tot {names}</label>
              <select id="relation" name="relation" className="input" defaultValue="">
                <option value="" disabled>Kies…</option>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input name="relationOther" aria-label="Anders, namelijk" placeholder="Anders, namelijk…" className="input mt-2" />
            </div>
            <fieldset>
              <legend className="label">Ben je erbij?</legend>
              <div className="flex flex-wrap gap-2 text-sm">
                <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name="attending" value="yes" required className="accent-[#6B1E2E]" /> Ja, ik kom!</label>
                {form.ask_part_of_day && <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name="attending" value="partial" className="accent-[#6B1E2E]" /> Een deel van de dag</label>}
                <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name="attending" value="no" className="accent-[#6B1E2E]" /> Helaas niet</label>
              </div>
            </fieldset>
            {form.ask_part_of_day && (
              <div><label className="label" htmlFor="partialNote">Alleen een deel van de dag? Van hoe laat tot hoe laat?</label><input id="partialNote" name="partialNote" className="input" /></div>
            )}
            <div>
              <label className="label" htmlFor="party">Wie neem je mee?</label>
              <textarea id="party" name="party" rows={2} className="input" placeholder="Eén naam per regel" />
              <p className="hint">Laat leeg als je alleen komt.</p>
            </div>
            {form.ask_diet && (
              <div><label className="label" htmlFor="diet">Dieetwensen of allergieën (ook van wie je meeneemt)</label><input id="diet" name="diet" className="input" /></div>
            )}
            {form.dresscode && (
              <fieldset>
                <legend className="label">De dresscode is: {form.dresscode}. Is dat duidelijk?</legend>
                <div className="flex gap-2 text-sm">
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name="dresscodeOk" value="yes" className="accent-[#6B1E2E]" /> Ja</label>
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name="dresscodeOk" value="no" className="accent-[#6B1E2E]" /> Ik heb een vraag</label>
                </div>
              </fieldset>
            )}
            {questions.map((q) =>
              q.kind === "yesno" ? (
                <fieldset key={q.id}>
                  <legend className="label">{q.label}</legend>
                  <div className="flex gap-2 text-sm">
                    <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name={`q-${q.id}`} value="Ja" className="accent-[#6B1E2E]" /> Ja</label>
                    <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"><input type="radio" name={`q-${q.id}`} value="Nee" className="accent-[#6B1E2E]" /> Nee</label>
                  </div>
                </fieldset>
              ) : (
                <div key={q.id}><label className="label" htmlFor={`q-${q.id}`}>{q.label}</label><input id={`q-${q.id}`} name={`q-${q.id}`} className="input" /></div>
              ),
            )}
            <SubmitButton className="btn-primary w-full" pendingText="Versturen…">Versturen</SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
