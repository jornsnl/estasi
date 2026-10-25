import Link from "next/link";
import { notFound } from "next/navigation";
import { changeAccess, changeCompletion, giveFeedback, newSetupLink } from "@/app/actions/admin";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { ProgressBar } from "@/components/ProgressBar";
import { SubmitButton } from "@/components/SubmitButton";
import { studentOverview } from "@/lib/academy";
import { getStore, type Answer, type AnswerableBlock, type Feedback } from "@/lib/data";
import { ACCESS_LABELS, remainingDays } from "@/lib/domain/access";
import { COURSE_STATUS_LABELS, feedbackState, isAnswerable, isAnswered } from "@/lib/domain/progress";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { formatDate, formatDateTime, toDateInput } from "@/lib/util/format";

export const metadata = { title: "Cursist" };

export default async function StudentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await params;
  const selectedLesson = (await searchParams).les;
  const store = getStore();
  const user = await store.getUser(userId);
  if (!user || user.role !== "student") notFound();

  const [o, profile, answers, feedback, log, settings, completions] = await Promise.all([
    studentOverview(user),
    store.getProfile(userId),
    store.listAnswers({ userId }),
    store.listFeedback({ userId }),
    store.listAudit(userId),
    store.getSettings(),
    store.listCompletions(userId),
  ]);
  const e = o.enrollment;
  const completedAt = new Map(completions.map((c) => [c.lessonId, c.completedAt]));
  const answersByBlock = new Map(answers.map((a) => [`${a.lessonId}:${a.blockId}`, a]));
  const setupLink = user.setupToken ? `${process.env.APP_URL ?? "http://localhost:3000"}/activeren/${user.setupToken}` : null;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/beheer" className="text-sm text-muted hover:text-bordeaux">← Alle cursisten</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">{user.name}</h1>
          {e && <Badge tone="gold">Pakket {e.package}</Badge>}
          {o.access !== "none" && <Badge tone={o.access === "active" ? "success" : "bordeaux"}>{ACCESS_LABELS[o.access]}</Badge>}
          {o.status && <Badge>{COURSE_STATUS_LABELS[o.status]}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {user.email}
          {profile?.phone && ` · ${profile.phone}`}
          {profile?.city && ` · ${profile.city}`}
          {profile?.companyName && ` · ${profile.companyName}`}
        </p>
      </header>

      <Notice searchParams={searchParams} />

      {setupLink && (
        <section className="card border-gold/50 bg-gold-soft/40 p-5">
          <h2 className="text-xl">{user.passwordHash ? "Herstellink" : "Activatielink"}</h2>
          <p className="mt-1 text-sm text-muted">
            Stuur deze link naar de cursist. Geldig tot {formatDateTime(user.setupTokenExpiresAt)}. In fase 2 gaat dit automatisch per e-mail.
          </p>
          <p className="mt-3 rounded-md border border-line bg-white p-3 font-mono text-sm break-all select-all">{setupLink}</p>
        </section>
      )}

      {e && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-6">
            <h2 className="text-2xl">Toegang</h2>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Aankoopdatum</dt>
              <dd>{formatDate(e.purchasedAt)}</dd>
              <dt className="text-muted">Einddatum</dt>
              <dd>{formatDate(e.endsAt)}</dd>
              <dt className="text-muted">Resterend</dt>
              <dd>{remainingDays(e)} dagen{e.pausedAt ? " (bevroren)" : ""}</dd>
              {e.pausedAt && (
                <>
                  <dt className="text-muted">Gepauzeerd sinds</dt>
                  <dd>{formatDate(e.pausedAt)}</dd>
                </>
              )}
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              <ActionForm action={changeAccess} userId={userId} op={e.pausedAt ? "resume" : "pause"} disabled={o.access !== "active" && o.access !== "paused"}>
                {e.pausedAt ? "Hervatten" : "Pauzeren"}
              </ActionForm>
              {e.revokedAt ? (
                <ActionForm action={changeAccess} userId={userId} op="restore">Intrekking ongedaan maken</ActionForm>
              ) : (
                <ActionForm action={changeAccess} userId={userId} op="revoke" danger confirm={`Toegang van ${user.name} intrekken?`}>
                  Intrekken
                </ActionForm>
              )}
            </div>

            <form action={changeAccess} className="mt-5 flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="op" value="extend" />
              <div>
                <label htmlFor="months" className="label">Verlengen met</label>
                <select id="months" name="months" className="input w-36" defaultValue="1">
                  {[1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>{m} maand{m > 1 ? "en" : ""}</option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn-secondary">Verlengen</SubmitButton>
            </form>

            <form action={changeAccess} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="op" value="setEnd" />
              <div>
                <label htmlFor="endsAt" className="label">Einddatum handmatig</label>
                <input id="endsAt" name="endsAt" type="date" defaultValue={toDateInput(e.endsAt)} className="input w-44" />
              </div>
              <SubmitButton className="btn-secondary">Opslaan</SubmitButton>
            </form>

            {e.pauses.length > 0 && (
              <div className="mt-5 text-sm">
                <p className="font-medium">Pauzes</p>
                <ul className="mt-1 text-muted">
                  {e.pauses.map((p) => (
                    <li key={p.pausedAt}>
                      {formatDate(p.pausedAt)} tot {p.resumedAt ? formatDate(p.resumedAt) : "nu"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-2xl">Afronding</h2>
            <div className="mt-4">
              <ProgressBar percent={o.percent} label="Voortgang" />
            </div>
            <p className="mt-3 text-sm text-muted">
              100% voortgang is geen formele afronding. Jij bekijkt de opdrachten en bevestigt persoonlijk.
            </p>

            <div className="mt-5 space-y-3 text-sm">
              <Row label="Online deel">
                {e.onlineCompletedAt ? (
                  <>
                    <span>Afgerond op {formatDate(e.onlineCompletedAt)}</span>
                    <ActionForm action={changeCompletion} userId={userId} op="undoOnline" small confirm="Bevestiging terugdraaien? Een vrijgegeven certificaat wordt dan ook ingetrokken.">
                      Terugdraaien
                    </ActionForm>
                  </>
                ) : (
                  <ActionForm action={changeCompletion} userId={userId} op="confirmOnline" primary confirm={`Online deel van ${user.name} bevestigen als afgerond?`}>
                    Bevestig online afronding
                  </ActionForm>
                )}
              </Row>
              <Row label="Online certificaat">
                {e.certificateReleasedAt ? (
                  <>
                    <span>Vrijgegeven op {formatDate(e.certificateReleasedAt)} ({e.certificateCode})</span>
                    <ActionForm action={changeCompletion} userId={userId} op="withdrawCertificate" small confirm="Certificaat intrekken?">
                      Intrekken
                    </ActionForm>
                  </>
                ) : (
                  <ActionForm action={changeCompletion} userId={userId} op="releaseCertificate" primary disabled={!e.onlineCompletedAt}>
                    Certificaat vrijgeven
                  </ActionForm>
                )}
              </Row>
              <Row label="Praktijkdeel">
                {e.package === "B" ? (
                  <form action={changeCompletion} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={userId} />
                    <input type="hidden" name="op" value="practical" />
                    <select name="practicalStatus" defaultValue={e.practicalStatus} className="input w-44 py-1.5">
                      <option value="none">Nog niet gepland</option>
                      <option value="planned">Gepland</option>
                      <option value="completed">Afgerond</option>
                    </select>
                    <SubmitButton className="btn-secondary py-1.5">Opslaan</SubmitButton>
                  </form>
                ) : (
                  <>
                    <span className="text-muted">Niet in pakket A</span>
                    <ActionForm
                      action={changeCompletion}
                      userId={userId}
                      op="upgrade"
                      small
                      disabled={!settings.practicalSpotsAvailable}
                      confirm="Upgraden naar pakket B? Regel de betaling eerst buiten het platform."
                    >
                      Upgrade naar B
                    </ActionForm>
                  </>
                )}
              </Row>
            </div>
            {e.package === "B" && (
              <p className="mt-3 text-xs text-muted">Het praktijkcertificaat verstuur je zelf buiten het platform.</p>
            )}
          </section>
        </div>
      )}

      <section>
        <h2 className="mb-4 text-3xl">Antwoorden en opdrachten</h2>
        <div className="space-y-4">
          {o.progress.map((p, i) => (
            <div key={p.module.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl">
                  <span className="text-muted">Module {i + 1}.</span> {p.module.title}
                </h3>
                <span className="text-sm text-muted">
                  {p.completedCount}/{p.lessons.length} lessen · {p.state === "locked" ? "vergrendeld" : p.state === "completed" ? "afgerond" : "open"}
                </span>
              </div>
              <div className="mt-3 divide-y divide-line border-t border-line">
                {p.lessons.map((lesson) => {
                  const questions = lesson.blocks.filter(isAnswerable);
                  const lessonAnswers = questions.map((b) => answersByBlock.get(`${lesson.id}:${b.id}`));
                  const answered = questions.filter((b, j) => isAnswered(b, lessonAnswers[j])).length;
                  const needsFeedback = questions.some((b, j) => {
                    const s = feedbackState(lessonAnswers[j], feedback);
                    return b.feedback && isAnswered(b, lessonAnswers[j]) && (s === "open" || s === "changed_after_feedback");
                  });
                  return (
                    <details key={lesson.id} open={selectedLesson === lesson.id} className="group py-3">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="font-medium group-open:text-bordeaux">{lesson.title}</span>
                        <span className="flex items-center gap-2 text-sm text-muted">
                          {needsFeedback && <Badge tone="bordeaux">Feedback open</Badge>}
                          {answered}/{questions.length} beantwoord
                          {completedAt.has(lesson.id) && <Badge tone="success">Afgerond {formatDate(completedAt.get(lesson.id))}</Badge>}
                        </span>
                      </summary>
                      <div className="mt-4 space-y-4">
                        {questions.length === 0 && <p className="text-sm text-muted">Deze les heeft geen vragen.</p>}
                        {questions.map((block, j) => (
                          <AnswerView key={block.id} block={block} answer={lessonAnswers[j]} feedback={feedback} />
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {e && (
        <section className="card p-6">
          <h2 className="text-2xl">Interne notities</h2>
          <p className="hint">Alleen zichtbaar voor jou.</p>
          <form action={changeCompletion} className="mt-3 space-y-3">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="op" value="notes" />
            <textarea name="ownerNotes" rows={4} defaultValue={e.ownerNotes} className="input" />
            <SubmitButton className="btn-secondary">Notities opslaan</SubmitButton>
          </form>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="text-2xl">Profiel</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <ProfileRow label="Instagram" value={profile?.instagram} />
            <ProfileRow label="Website" value={profile?.website} />
            <ProfileRow label="Introductie" value={profile?.intro} />
            <ProfileRow label="Ondernemersdoelen" value={profile?.goals} />
          </dl>
          <form action={newSetupLink} className="mt-5">
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton className="btn-secondary">{user.passwordHash ? "Wachtwoord-herstellink maken" : "Nieuwe activatielink maken"}</SubmitButton>
          </form>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl">Wijzigingslog</h2>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
            {log.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="w-32 shrink-0 text-muted">{formatDateTime(entry.at)}</span>
                <span>
                  {entry.action}
                  {entry.details && <span className="text-muted"> · {entry.details}</span>}
                </span>
              </li>
            ))}
            {log.length === 0 && <li className="text-muted">Nog geen wijzigingen.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ActionForm({
  action,
  userId,
  op,
  children,
  danger,
  primary,
  small,
  disabled,
  confirm,
}: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  op: string;
  children: React.ReactNode;
  danger?: boolean;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
  confirm?: string;
}) {
  const className = `${danger ? "btn-danger" : primary ? "btn-primary" : "btn-secondary"} ${small ? "px-3 py-1.5 text-xs" : ""}`;
  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        {children}
      </button>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton className={className} confirm={confirm}>
        {children}
      </SubmitButton>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
      <span className="font-medium">{label}</span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap">{value || "–"}</dd>
    </div>
  );
}

function AnswerView({ block, answer, feedback }: { block: AnswerableBlock; answer: Answer | undefined; feedback: Feedback[] }) {
  const items = answer ? feedback.filter((f) => f.answerId === answer.id) : [];
  const state = feedbackState(answer, feedback);
  return (
    <div className="rounded-lg bg-cream/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{block.prompt || "(vraag zonder tekst)"}</p>
        {block.required && <Badge tone="bordeaux">Verplicht</Badge>}
        {block.feedback && <Badge tone="gold">Feedbackopdracht</Badge>}
        {state === "changed_after_feedback" && <Badge tone="bordeaux">Aangepast na feedback</Badge>}
      </div>
      {answer && isAnswered(block, answer) ? (
        <>
          {block.type === "question" && <p className="mt-2 whitespace-pre-wrap">{answer.text}</p>}
          {block.type === "choice" && <p className="mt-2">Gekozen: {answer.choice}</p>}
          {block.type === "upload" && (
            <ul className="mt-2 space-y-1">
              {answer.files.map((f) => (
                <li key={f.id}>
                  <a href={`/api/bestanden/${f.id}`} className="text-bordeaux underline">{f.name}</a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Laatst gewijzigd {formatDateTime(answer.updatedAt)} · versie {answer.version}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Nog niet beantwoord.</p>
      )}

      {items.map((f) => (
        <div key={f.id} className="mt-3 rounded-md border-l-2 border-gold bg-white p-3 text-sm">
          <p className="text-xs text-muted">
            Jouw feedback · {formatDateTime(f.createdAt)} · op versie {f.answerVersion}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{f.text}</p>
          {f.attachment && (
            <a href={`/api/bestanden/${f.attachment.id}`} className="text-bordeaux underline">Bijlage: {f.attachment.name}</a>
          )}
        </div>
      ))}

      {answer && isAnswered(block, answer) && (
        <details className="mt-3" open={block.feedback && (state === "open" || state === "changed_after_feedback")}>
          <summary className="cursor-pointer text-sm text-bordeaux">Feedback geven</summary>
          <form action={giveFeedback} className="mt-2 space-y-2">
            <input type="hidden" name="answerId" value={answer.id} />
            <textarea name="text" rows={3} required className="input" placeholder="Schrijf je feedback…" />
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" name="attachment" accept={ACCEPT_ATTR} className="text-sm" />
              <SubmitButton className="btn-primary py-2" pendingText="Opslaan…">Feedback opslaan</SubmitButton>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
