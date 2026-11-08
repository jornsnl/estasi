import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSpeech, moveSpeech, saveSpeech } from "@/app/actions/ws-speeches";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { SortableRows } from "@/components/ws/SortableRows";
import { requireOwner } from "@/lib/auth/session";
import { isUuid, one, query } from "@/lib/ws/db";
import { coupleName, formatDate } from "@/lib/ws/format";
import { speechesFor, type Speech } from "@/lib/ws/speeches";
import {
  formatMinutes,
  incompleteReasons,
  momentLabel,
  needsOf,
  needsSummary,
  SPEECH_MOMENTS,
  SPEECH_NEEDS,
  SPEECH_STATUS,
  speechesTitle,
  totalMinutes,
  type SpeechStatus,
} from "@/lib/ws/speeches-pure";
import type { Couple } from "@/lib/ws/types";

type Guest = { id: string; name: string };

export async function generateMetadata({ params }: { params: Promise<{ coupleId: string }> }) {
  const { coupleId } = await params;
  const couple = isUuid(coupleId) ? await one<Couple>("select * from couples where id = $1", [coupleId]) : null;
  return { title: couple ? speechesTitle(couple) : "Speeches" };
}

const STATUS_STYLE: Record<SpeechStatus, string> = {
  aangemeld: "bg-cream text-gold-ink",
  bevestigd: "bg-success-soft text-success",
  materiaal: "bg-success-soft text-success",
  techniek: "bg-success-soft text-success",
};

function SpeechFields({ s, guests }: { s?: Speech; guests: Guest[] }) {
  const id = s?.id ?? "nieuw";
  const f = (name: string) => `${name}-${id}`;
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-3">
        <label className="label" htmlFor={f("guest")}>Spreker uit de gastenlijst</label>
        <select id={f("guest")} name="guestId" defaultValue={s?.guest_id ?? ""} className="input py-1.5">
          <option value="">Niet uit de gastenlijst</option>
          {guests.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={f("speaker")}>Of naam spreker</label>
        <input id={f("speaker")} name="speakerName" maxLength={200} defaultValue={s && !s.guest_id ? s.speaker_name : ""} className="input py-1.5" />
      </div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={f("relation")}>Relatie tot het bruidspaar</label>
        <input id={f("relation")} name="relation" maxLength={200} defaultValue={s?.relation ?? ""} placeholder="Bijvoorbeeld vader van de bruid" className="input py-1.5" />
      </div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={f("moment")}>Moment</label>
        <div className="flex gap-2">
          <select id={f("moment")} name="moment" defaultValue={s?.moment ?? ""} className="input py-1.5">
            <option value="">Nog niet bekend</option>
            {Object.entries(SPEECH_MOMENTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input name="momentOther" maxLength={200} defaultValue={s?.moment_other ?? ""} aria-label="Eigen invulling moment" placeholder="Eigen invulling" className="input py-1.5" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={f("time")}>Geplande tijd (optioneel)</label>
        <input id={f("time")} name="plannedTime" type="time" defaultValue={s?.planned_time ?? ""} className="input py-1.5" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={f("duration")}>Duur (minuten)</label>
        <input id={f("duration")} name="duration" type="number" min={0} max={600} defaultValue={s?.duration_minutes ?? ""} className="input py-1.5" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={f("status")}>Status</label>
        <select id={f("status")} name="status" defaultValue={s?.status ?? "aangemeld"} className="input py-1.5">
          {Object.entries(SPEECH_STATUS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <fieldset className="sm:col-span-6">
        <legend className="label">Benodigdheden</legend>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {Object.entries(SPEECH_NEEDS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" name="needs" value={k} defaultChecked={s?.needs.includes(k)} className="accent-[#6B1E2E]" /> {label}
            </label>
          ))}
          <input name="needsOther" maxLength={300} defaultValue={s?.needs_other ?? ""} aria-label="Eigen invulling benodigdheden" placeholder="Eigen invulling (met komma's)" className="input min-w-48 flex-1 py-1.5" />
        </div>
      </fieldset>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={f("phone")}>Telefoon spreker</label>
        <input id={f("phone")} name="phone" type="tel" maxLength={60} defaultValue={s?.phone ?? ""} className="input py-1.5" />
      </div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={f("email")}>E-mail spreker</label>
        <input id={f("email")} name="email" type="email" maxLength={200} defaultValue={s?.email ?? ""} className="input py-1.5" />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-6">
        <input type="checkbox" name="surprise" defaultChecked={s?.surprise} className="accent-[#6B1E2E]" /> Verrassing voor het bruidspaar
      </label>
      <div className="sm:col-span-6">
        <label className="label" htmlFor={f("notes")}>Notities</label>
        <textarea id={f("notes")} name="notes" rows={3} maxLength={4000} defaultValue={s?.notes ?? ""} className="input py-1.5 text-sm" />
      </div>
      <p className="text-xs text-muted sm:col-span-6">Bij een gast uit de gastenlijst vullen telefoon en e-mail zich vanzelf in als je ze leeg laat.</p>
    </div>
  );
}

/** The speeches of one couple (feedback 12.2). Sabine only: the /beheer layout and speechesFor both check the owner role. */
export default async function CoupleSpeeches({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  const { coupleId } = await params;
  if (!isUuid(coupleId)) notFound();
  const couple = await one<Couple>("select * from couples where id = $1", [coupleId]);
  if (!couple) notFound();
  const [speeches, guests] = await Promise.all([
    speechesFor(couple.id),
    query<Guest>(
      "select id, trim(first_name || ' ' || last_name) as name from guests where couple_id = $1 order by first_name, last_name",
      [couple.id],
    ),
  ]);
  const minutes = totalMinutes(speeches);
  const needs = needsSummary(speeches);
  const open = speeches.filter((s) => incompleteReasons(s).length > 0).length;

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/beheer/bruidsparen/speeches" className="text-sm text-muted hover:text-bordeaux">← Alle speeches</Link>
          <h1 className="mt-1 text-3xl">Speeches {coupleName(couple)}</h1>
          <p className="mt-1 text-sm text-muted">
            Trouwdatum {couple.wedding_date ? formatDate(couple.wedding_date) : "nog niet bekend"} · alleen voor jou, het bruidspaar ziet dit nooit.
          </p>
        </div>
        <Link href={`/beheer/bruidsparen/speeches/${couple.id}/print`} target="_blank" className="btn-secondary">Speechlijst printen / downloaden als PDF</Link>
      </header>
      <Notice searchParams={searchParams} />

      <section aria-label="Samenvatting" className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-muted">Speeches</p><p className="font-serif text-3xl">{speeches.length}</p>{open > 0 && <p className="text-xs text-gold-ink">{open} nog niet compleet</p>}</div>
        <div className="card p-4"><p className="text-sm text-muted">Totale duur</p><p className="font-serif text-3xl">{formatMinutes(minutes)}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Benodigdheden</p><p className="mt-1 text-sm">{needs || "Geen"}</p></div>
      </section>

      <section className="space-y-2">
        <h2 className="section-title">Volgorde</h2>
        {speeches.length > 0 ? (
          <div className="card">
            <SortableRows
              label="Speeches"
              move={moveSpeech}
              rows={speeches.map((s, i) => {
                const reasons = incompleteReasons(s);
                const status = (s.status in SPEECH_STATUS ? s.status : "aangemeld") as SpeechStatus;
                return {
                  id: s.id,
                  node: (
                    <details id={`speech-${s.id}`} className={`scroll-mt-6 ${reasons.length ? "border-l-2 border-gold/60 pl-2" : "pl-2.5"}`}>
                      <summary className="cursor-pointer list-none text-sm">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
                          <span className="w-12 tabular-nums">{s.planned_time || <span className="text-muted">--:--</span>}</span>
                          <span className="font-medium">{s.speaker_name}</span>
                          {s.relation && <span className="text-muted">· {s.relation}</span>}
                          {momentLabel(s) && <span className="text-muted">· {momentLabel(s)}</span>}
                          {s.duration_minutes != null && <span className="text-muted">· {s.duration_minutes} min</span>}
                          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{SPEECH_STATUS[status]}</span>
                          {s.surprise && <span className="rounded-full bg-bordeaux-soft px-2 py-0.5 text-xs text-bordeaux">Verrassing</span>}
                        </span>
                        {(reasons.length > 0 || needsOf(s).length > 0) && (
                          <span className="mt-0.5 block pl-7 text-xs text-muted">
                            {needsOf(s).join(", ")}
                            {reasons.length > 0 && <span className="text-gold-ink">{needsOf(s).length ? " · " : ""}Nog niet compleet: {reasons.join(", ")}</span>}
                          </span>
                        )}
                      </summary>
                      <div className="mt-3 space-y-3 pb-2">
                        <form action={saveSpeech} className="space-y-3">
                          <input type="hidden" name="coupleId" value={couple.id} />
                          <input type="hidden" name="speechId" value={s.id} />
                          <SpeechFields s={s} guests={guests} />
                          <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">Opslaan</SubmitButton>
                        </form>
                        <form action={deleteSpeech}>
                          <input type="hidden" name="coupleId" value={couple.id} />
                          <input type="hidden" name="speechId" value={s.id} />
                          <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`De speech van ${s.speaker_name} verwijderen?`}>Verwijderen</SubmitButton>
                        </form>
                      </div>
                    </details>
                  ),
                };
              })}
            />
          </div>
        ) : (
          <p className="card p-4 text-sm text-muted">Nog geen speeches.</p>
        )}
        <p className="text-xs text-muted">Sleep aan het handvat of gebruik de pijltjes om de volgorde te veranderen. Klik op een speech om hem te bewerken.</p>
      </section>

      <details id="toevoegen" className="card scroll-mt-6 p-4" open={speeches.length === 0}>
        <summary className="cursor-pointer text-sm font-medium text-bordeaux">+ Speech toevoegen</summary>
        <form action={saveSpeech} className="mt-3 space-y-3">
          <input type="hidden" name="coupleId" value={couple.id} />
          <SpeechFields guests={guests} />
          <SubmitButton className="btn-primary py-1.5" pendingText="Toevoegen…">Speech toevoegen</SubmitButton>
        </form>
      </details>
    </div>
  );
}
