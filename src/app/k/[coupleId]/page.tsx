import Link from "next/link";
import { addTask, answerQuestion, askQuestion, deleteTask, toggleTask } from "@/app/actions/ws-portal";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { getSettings } from "@/lib/ws/settings";
import { countdownLabel, coupleName, formatDate, formatDateTime, LANE_LABELS, LANES } from "@/lib/ws/format";
import type { Question, Task } from "@/lib/ws/types";

export const metadata = { title: "Overzicht" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CoupleHome({ params, searchParams }: { params: Promise<{ coupleId: string }>; searchParams: Search }) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  const base = `/k/${couple.id}`;
  const [tasks, questions, settings] = await Promise.all([
    query<Task>("select * from tasks where couple_id = $1 and done_at is null order by position, created_at", [couple.id]),
    query<Question>(
      `select q.* from questions q
        where q.couple_id = $1 and q.answered_at is null order by q.asked_at`,
      [couple.id],
    ),
    getSettings(),
  ]);
  const countdown = countdownLabel(couple.wedding_date);

  const tiles = [
    { label: "Jullie Pakket", href: `${base}/pakket` },
    { label: "Draaiboek", href: `${base}/draaiboek` },
    ...(couple.suppliers_enabled ? [{ label: "Jullie leveranciers", href: `${base}/leveranciers` }] : []),
    { label: "Afspraken & deadlines", href: `${base}/afspraken` },
    { label: "Gastenlijst & RSVP", href: `${base}/gasten` },
    { label: "Stylingplan & Moodboard", href: `${base}/styling` },
    { label: "Opdrachten", href: `${base}/opdrachten` },
    { label: "Kostenoverzicht", href: `${base}/kosten` },
  ];

  return (
    <div className="space-y-10">
      <Notice searchParams={searchParams} />

      {/* Cover with names and countdown */}
      <section
        className="relative h-56 overflow-hidden rounded-2xl bg-cover bg-center sm:h-64"
        style={{
          backgroundImage: couple.cover_file_id
            ? `linear-gradient(0deg, rgba(44,44,44,0.55), rgba(44,44,44,0.1)), url(/api/ws-bestanden/${couple.cover_file_id})`
            : "linear-gradient(0deg, rgba(44,44,44,0.5), rgba(44,44,44,0.12)), linear-gradient(135deg, #A89650, #8a7838)",
        }}
      >
        <div className="absolute bottom-5 left-6 text-white">
          <p className="text-[11px] tracking-[0.2em] uppercase opacity-90">Your Wedding Space</p>
          <h1 className="mt-1 text-3xl text-white sm:text-4xl">{coupleName(couple)}</h1>
          {couple.wedding_date && (
            <p className="mt-1 text-sm opacity-90">
              {couple.wedding_date_confirmed ? formatDate(couple.wedding_date) : `${formatDate(couple.wedding_date)} (nog niet bevestigd)`}
              {couple.location && ` · ${couple.location}`}
            </p>
          )}
        </div>
        {countdown && (
          <div className="absolute top-5 right-5 rounded-xl bg-white/95 px-4 py-2 text-center">
            <p className="text-[10px] tracking-[0.12em] text-bordeaux uppercase">{countdown.match(/^\d/) ? "Nog" : "De grote dag"}</p>
            <p className="font-serif text-xl font-semibold">{countdown}</p>
          </div>
        )}
      </section>

      {couple.welcome_text && <p className="max-w-3xl text-[15px] leading-7 whitespace-pre-line text-muted">{couple.welcome_text}</p>}

      {/* Tiles */}
      <section>
        <h2 className="section-title mb-3">Jullie overzicht</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) =>
            tile.href ? (
              <Link key={tile.label} href={tile.href} className="rounded-xl bg-white px-4 py-4 font-serif font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow">
                {tile.label}
              </Link>
            ) : (
              <div key={tile.label} className="rounded-xl bg-cream-deep/60 px-4 py-4">
                <span className="block font-serif font-semibold text-ink/60">{tile.label}</span>
                <span className="text-xs text-muted">Volgt binnenkort</span>
              </div>
            ),
          )}
        </div>
      </section>

      {/* Task board */}
      <section id="takenlijst" className="scroll-mt-6">
        <div className="mb-3 flex items-baseline gap-4">
          <h2 className="section-title">Takenlijst</h2>
          <Link href={`${base}/geschiedenis?soort=taken`} className="text-sm text-bordeaux hover:underline">Geschiedenis</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LANES.map((lane) => {
            const laneTasks = tasks.filter((t) => t.lane === lane);
            return (
              <div key={lane} className="flex flex-col rounded-xl bg-cream-deep/70 p-2.5">
                <h3 className="mb-2 px-1 font-sans text-sm font-medium text-bordeaux">
                  {LANE_LABELS[lane]} <span className="text-muted">({laneTasks.length})</span>
                </h3>
                <ul className="space-y-2">
                  {laneTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2 rounded-lg bg-white p-2.5 text-sm shadow-sm">
                      <form action={toggleTask}>
                        <input type="hidden" name="coupleId" value={couple.id} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <button type="submit" aria-label={`${task.title} afvinken`} title="Afvinken" className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gold hover:bg-gold/20" />
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className="break-words">{task.title}</p>
                        {task.deadline && <p className="text-xs text-muted">{formatDate(task.deadline, false)}</p>}
                      </div>
                      {isAdmin && (
                        <form action={deleteTask}>
                          <input type="hidden" name="coupleId" value={couple.id} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${task.title}" verwijderen?`}>×</SubmitButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <details className="mt-2">
                  <summary className="cursor-pointer rounded-lg px-1 py-1 text-sm text-muted hover:text-ink">+ Taak toevoegen</summary>
                  <form action={addTask} className="mt-2 space-y-2">
                    <input type="hidden" name="coupleId" value={couple.id} />
                    <input type="hidden" name="lane" value={lane} />
                    <input name="title" required maxLength={200} placeholder="Wat moet er gebeuren?" aria-label={`Nieuwe taak voor ${LANE_LABELS[lane]}`} className="input py-2 text-sm" />
                    <input name="deadline" type="date" aria-label="Deadline (optioneel)" className="input py-2 text-sm" />
                    <SubmitButton className="btn-secondary w-full py-2">Toevoegen</SubmitButton>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      {/* Questions block */}
      <section id="vragenblok" className="scroll-mt-6">
        <div className="mb-3 flex items-baseline gap-4">
          <h2 className="section-title">Vragenblok</h2>
          <Link href={`${base}/geschiedenis?soort=vragen`} className="text-sm text-bordeaux hover:underline">Geschiedenis</Link>
        </div>
        <div className="card space-y-4 p-5">
          {questions.length === 0 && <p className="text-sm text-muted">Geen openstaande vragen.</p>}
          {questions.map((q) => (
            <div key={q.id} className="rounded-xl bg-cream p-4">
              <p className="text-sm whitespace-pre-line">{q.body}</p>
              <p className="mt-1 text-xs text-muted">{q.asked_by_name || "Onbekend"} · {formatDateTime(q.asked_at)}</p>
              {isAdmin ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-bordeaux">Beantwoorden</summary>
                  <form action={answerQuestion} className="mt-2 space-y-2">
                    <input type="hidden" name="coupleId" value={couple.id} />
                    <input type="hidden" name="questionId" value={q.id} />
                    <textarea name="answer" rows={4} required className="input" aria-label="Antwoord" />
                    <SubmitButton className="btn-primary" pendingText="Versturen…">Antwoord versturen</SubmitButton>
                  </form>
                </details>
              ) : (
                <p className="mt-2 text-xs text-gold-ink">Sabine beantwoordt deze vraag zo snel mogelijk.</p>
              )}
            </div>
          ))}
          <form action={askQuestion} className="space-y-2 border-t border-line pt-4">
            <input type="hidden" name="coupleId" value={couple.id} />
            <label htmlFor="body" className="label">{isAdmin ? "Vraag of punt toevoegen" : "Een vraag of iets waar jullie hulp bij nodig hebben?"}</label>
            <textarea id="body" name="body" rows={3} required maxLength={4000} className="input" />
            <SubmitButton className="btn-primary" pendingText="Versturen…">Vraag versturen</SubmitButton>
          </form>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-2xl bg-ink p-6 text-cream">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-serif text-lg">{settings.contact_name}</p>
            <a href={`mailto:${settings.contact_email}`} className="text-sm underline-offset-2 hover:underline">{settings.contact_email}</a>
          </div>
          <details className="group">
            <summary className="btn cursor-pointer list-none bg-cream text-ink hover:bg-white">Contact</summary>
            <div className="mt-3 rounded-xl bg-white p-5 text-sm text-ink">
              {settings.contact_photo_file_id && (
                // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
                <img src="/api/ws-foto" alt={`Pasfoto van ${settings.contact_name}`} width={96} height={96} className="mb-3 h-24 w-24 rounded-full object-cover" />
              )}
              <p className="font-serif text-base font-semibold">{settings.contact_name}</p>
              <p className="text-muted">{settings.business_name}</p>
              <dl className="mt-3 space-y-1">
                <div><dt className="inline text-muted">E-mail: </dt><dd className="inline"><a className="text-bordeaux" href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a></dd></div>
                <div><dt className="inline text-muted">Telefoon: </dt><dd className="inline"><a className="text-bordeaux" href={`tel:${settings.contact_phone.replace(/\s/g, "")}`}>{settings.contact_phone}</a></dd></div>
                <div><dt className="inline text-muted">Adres: </dt><dd className="inline">{settings.contact_address}</dd></div>
                <div><dt className="inline text-muted">KVK: </dt><dd className="inline">{settings.kvk}</dd></div>
              </dl>
              {settings.terms_url && <a href={settings.terms_url} className="mt-3 inline-block text-bordeaux underline" target="_blank" rel="noreferrer">Algemene voorwaarden</a>}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
