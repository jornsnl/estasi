import Link from "next/link";
import { practicalSpotsOf } from "@/lib/practical-spots";
import { notFound } from "next/navigation";
import { changeAccess, changeCompletion, changeModuleUnlock, newSetupLink, setTemporaryPassword, updateStudentDetails } from "@/app/actions/admin";
import { generateTemporaryPassword, mustChangePassword } from "@/lib/auth/temporary-password";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { CertificateControls } from "@/components/academy/CertificateControls";
import { StudentAdminSummary } from "@/components/academy/StudentAdminSummary";
import { StudentPrivacyPanel } from "@/components/academy/StudentPrivacyPanel";
import { SubmissionPanel } from "@/components/academy/SubmissionPanel";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { ProgressBar } from "@/components/ProgressBar";
import { SubmitButton } from "@/components/SubmitButton";
import { studentOverview } from "@/lib/academy";
import { onlineCertificateCheck } from "@/lib/academy-feedback";
import { getStore, type Lesson, type Submission, type SubmissionVersion } from "@/lib/data";
import { listAssignmentFeedback } from "@/lib/data/assignments";
import { assignmentsOf, isSubmitted } from "@/lib/domain/assignment";
import { ACCESS_LABELS, DEFAULT_EXTEND_MONTHS, EXTEND_MONTHS, remainingDays } from "@/lib/domain/access";
import { isActivated } from "@/lib/domain/account";
import { LIMITS } from "@/lib/domain/input";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { devAuthAllowed, devPendingLink } from "@/lib/auth/dev-auth";
import { supabaseEnabled } from "@/lib/supabase/config";
import { COURSE_STATUS_LABELS, modulePercent } from "@/lib/domain/progress";
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

  const [o, profile, feedback, log, settings, completions, lessons, spots] = await Promise.all([
    studentOverview(user),
    store.getProfile(userId),
    listAssignmentFeedback({ userId }),
    store.listAudit(userId),
    store.getSettings(),
    store.listCompletions(userId),
    store.listLessons(),
    practicalSpotsOf(userId),
  ]);
  const e = o.enrollment;
  const completedAt = new Map(completions.map((c) => [c.lessonId, c.completedAt]));
  const subsByBlock = new Map(o.submissions.map((s) => [`${s.lessonId}:${s.blockId}`, s]));
  const versionsOf = (s: Submission | undefined) => (s ? o.versions.filter((v) => v.submissionId === s.id).sort((a, b) => a.version - b.version) : []);
  const setup = devAuthAllowed() ? await devPendingLink(user.id) : null;
  const activated = isActivated(user);
  const temporaryPending = await mustChangePassword(userId);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/beheer" className="text-sm text-muted hover:text-bordeaux">← Alle cursisten</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">{user.name}</h1>
          {e && <Badge tone="gold">Pakket {e.package} · {PACKAGE_LABELS[e.package]}</Badge>}
          {o.access !== "none" && <Badge tone={o.access === "active" ? "success" : "bordeaux"}>{ACCESS_LABELS[o.access]}</Badge>}
          {o.status && COURSE_STATUS_LABELS[o.status] !== (o.access === "none" ? "" : ACCESS_LABELS[o.access]) && <Badge>{COURSE_STATUS_LABELS[o.status]}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {user.email}
          {profile?.phone && ` · ${profile.phone}`}
          {profile?.city && ` · ${profile.city}`}
          {profile?.companyName && ` · ${profile.companyName}`}
        </p>
        <Link href={`/beheer/voorbeeld?cursist=${user.id}`} className="btn-secondary mt-3 inline-flex px-3 py-1.5 text-sm">Bekijk als deze cursist</Link>
      </header>

      <Notice searchParams={searchParams} />

      {setup && (
        <section className="card border-gold/50 bg-gold-soft/40 p-5">
          <h2 className="text-xl">{activated ? "Herstellink" : "Activatielink"}</h2>
          <p className="mt-1 text-sm text-muted">
            Stuur deze link naar de cursist. Geldig tot {formatDateTime(setup.expiresAt)}. (Ontwikkel-login: met Supabase gaat dit per e-mail.)
          </p>
          <p className="mt-3 rounded-md border border-line bg-white p-3 font-mono text-sm break-all select-all">{setup.link}</p>
        </section>
      )}

      {supabaseEnabled() && !activated && (
        <section className="card border-gold/50 bg-gold-soft/40 p-5">
          <h2 className="text-xl">Nog niet geactiveerd</h2>
          <p className="mt-1 text-sm text-muted">
            De uitnodiging is gemaild naar {user.email}. De link in die e-mail is beperkt geldig; is hij verlopen, mail dan
            onderaan bij Profiel een nieuwe uitnodiging.
          </p>
        </section>
      )}

      <StudentAdminSummary overview={o} lessons={lessons} feedback={feedback} />

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
              <dd>{plural(remainingDays(e), "dag", "dagen")}{e.pausedAt ? " (bevroren)" : ""}</dd>
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
                <select id="months" name="months" className="input w-36" defaultValue={DEFAULT_EXTEND_MONTHS}>
                  {EXTEND_MONTHS.map((m) => (
                    <option key={m} value={m}>{plural(m, "maand", "maanden")}</option>
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
              <CertificateControls userId={userId} enrollment={e} onlineMissing={onlineCertificateCheck(o).missing} />
              {spots.length > 0 && (
                <Row label="Praktijkplek">
                  <span>
                    {spots.map((spot) => `${formatDate(spot.wedding_date)} · ${spot.couple_names}`).join(", ")}{" "}
                    <Link href="/beheer/instellingen#praktijkplekken" className="text-bordeaux underline">Praktijkplekken</Link>
                  </span>
                </Row>
              )}
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">Het praktijkcertificaat geef je hierboven vrij zodra de meeloopbruiloft is afgerond.</p>
                <ActionForm
                  action={changeCompletion}
                  userId={userId}
                  op="downgrade"
                  small
                  confirm="Terugzetten naar pakket A? Modules die alleen voor pakket B zijn, verdwijnen dan voor deze cursist. De voortgang blijft bewaard."
                >
                  Terug naar pakket A
                </ActionForm>
              </div>
            )}
          </section>
        </div>
      )}

      <section>
        <h2 className="text-3xl">Voortgang en opdrachten</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          {o.completedModules} van {plural(o.progress.length, "module", "modules")} afgerond · {plural(o.submittedAssignments, "opdracht", "opdrachten")} ingediend
          {o.openFeedback > 0 && ` · ${o.openFeedback} feedbackverzoek${o.openFeedback === 1 ? "" : "en"} open`}.{e && ` Alleen modules van pakket ${e.package} tellen mee.`}
        </p>
        <div className="space-y-4">
          {o.progress.map((p, i) => (
            <div key={p.module.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl">
                  <span className="text-muted">Module {i + 1}.</span> {p.module.title}
                </h3>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {p.completedCount}/{plural(p.lessons.length, "les", "lessen")} ({modulePercent(p)}%) · {p.assignments.submitted}/{plural(p.assignments.total, "opdracht", "opdrachten")} ingediend ·{" "}
                  {p.state === "locked" ? "vergrendeld" : p.state === "completed" ? "afgerond" : p.unlockedManually ? "handmatig vrijgegeven" : "open"}
                  {p.state === "locked" && (
                    <UnlockForm userId={userId} moduleId={p.module.id} op="unlock">Nu vrijgeven</UnlockForm>
                  )}
                  {p.unlockedManually && (
                    <UnlockForm userId={userId} moduleId={p.module.id} op="lock">Vrijgave intrekken</UnlockForm>
                  )}
                </span>
              </div>
              <div className="mt-3 divide-y divide-line border-t border-line">
                {p.lessons.map((lesson) => {
                  const assignments = assignmentsOf(lesson.blocks);
                  const subs = assignments.map((a) => subsByBlock.get(`${lesson.id}:${a.id}`));
                  const submitted = subs.filter((s) => isSubmitted(s?.status)).length;
                  const needsFeedback = subs.some((s) => versionsOf(s).some((v) => v.feedbackStatus === "nieuw" || v.feedbackStatus === "in_behandeling"));
                  return (
                    <details key={lesson.id} open={selectedLesson === lesson.id} className="group py-3">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="font-medium group-open:text-bordeaux">{lesson.title}</span>
                        <span className="flex items-center gap-2 text-sm text-muted">
                          {needsFeedback && <Badge tone="bordeaux">Feedback gevraagd</Badge>}
                          {submitted}/{assignments.length} ingediend
                          {completedAt.has(lesson.id) && <Badge tone="success">Afgerond {formatDate(completedAt.get(lesson.id))}</Badge>}
                        </span>
                      </summary>
                      <div className="mt-4 space-y-4">
                        {assignments.length === 0 && <p className="text-sm text-muted">Deze les heeft geen opdrachten.</p>}
                        {assignments.map((assignment, j) => (
                          <SubmissionPanel
                            key={assignment.id}
                            assignment={assignment}
                            submission={subs[j]}
                            versions={versionsOf(subs[j])}
                            feedback={feedback}
                            original={assignment.repeatOf ? findOriginal(assignment.repeatOf, lessons, o.submissions, o.versions) : null}
                          />
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
            <textarea name="ownerNotes" rows={4} defaultValue={e.ownerNotes} maxLength={LIMITS.ownerNotes} className="input" aria-label="Interne notities" />
            <SubmitButton className="btn-secondary">Notities opslaan</SubmitButton>
          </form>
        </section>
      )}

      <section className="card p-6">
        <h2 className="text-2xl">Gegevens</h2>
        <p className="hint">De cursist kan naam, telefoon, woonplaats en bedrijfsnaam ook zelf aanpassen bij Mijn profiel.</p>
        <form action={updateStudentDetails} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="userId" value={userId} />
          <div>
            <label htmlFor="d-name" className="label">Naam</label>
            <input id="d-name" name="name" required defaultValue={user.name} maxLength={LIMITS.name} className="input" />
          </div>
          <div>
            <span className="label">E-mailadres</span>
            <p className="input bg-cream text-muted">{user.email}</p>
          </div>
          <div>
            <label htmlFor="d-phone" className="label">Telefoon</label>
            <input id="d-phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} maxLength={LIMITS.phone} className="input" />
          </div>
          <div>
            <label htmlFor="d-city" className="label">Woonplaats</label>
            <input id="d-city" name="city" defaultValue={profile?.city ?? ""} maxLength={LIMITS.city} className="input" />
          </div>
          <div>
            <label htmlFor="d-company" className="label">Bedrijfsnaam</label>
            <input id="d-company" name="companyName" defaultValue={profile?.companyName ?? ""} maxLength={LIMITS.companyName} className="input" />
          </div>
          {e && (
            <div>
              <label htmlFor="d-purchased" className="label">Aankoopdatum</label>
              <input id="d-purchased" name="purchasedAt" type="date" defaultValue={toDateInput(e.purchasedAt)} className="input" />
              <p className="hint">De einddatum verandert hierdoor niet; die pas je aan bij Toegang.</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <SubmitButton className="btn-secondary" pendingText="Opslaan…">Gegevens opslaan</SubmitButton>
          </div>
        </form>
      </section>

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
            <SubmitButton className="btn-secondary">{supabaseEnabled()
                ? activated ? "Wachtwoord-herstellink mailen" : "Uitnodiging opnieuw mailen"
                : activated ? "Wachtwoord-herstellink maken" : "Nieuwe activatielink maken"}</SubmitButton>
          </form>
          <details id="tijdelijk-wachtwoord" className="mt-5 rounded-lg border border-line p-4" open={temporaryPending || undefined}>
            <summary className="cursor-pointer text-sm font-medium">Tijdelijk wachtwoord instellen</summary>
            {temporaryPending && (
              <p className="mt-3 text-sm text-gold-ink">Er staat een tijdelijk wachtwoord klaar: de cursist heeft nog geen eigen wachtwoord gekozen.</p>
            )}
            <p className="mt-3 text-sm text-muted">
              Noodoptie als de uitnodiging niet aankomt. Jij kent dit wachtwoord en geeft het zelf door, bijvoorbeeld telefonisch of via WhatsApp (niet in
              dezelfde mail als het e-mailadres). Na het inloggen moet de cursist meteen een eigen wachtwoord kiezen.
            </p>
            <form action={setTemporaryPassword} className="mt-3 space-y-3">
              <input type="hidden" name="userId" value={userId} />
              <div>
                <label htmlFor="temporaryPassword" className="label">Tijdelijk wachtwoord</label>
                <input id="temporaryPassword" name="password" type="text" defaultValue={generateTemporaryPassword()} minLength={MIN_PASSWORD_LENGTH} maxLength={200} required autoComplete="off" spellCheck={false} className="input font-mono" />
                <p className="hint">Voorgesteld wachtwoord; je mag het aanpassen (minimaal {MIN_PASSWORD_LENGTH} tekens). Kopieer het voordat je opslaat.</p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm" className="mt-1 accent-[#722F37]" required />
                <span>Ik geef dit wachtwoord zelf door aan {user.name}. Een eerder wachtwoord werkt daarna niet meer.</span>
              </label>
              <SubmitButton className="btn-secondary" pendingText="Instellen…">Tijdelijk wachtwoord instellen</SubmitButton>
            </form>
          </details>
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

      <StudentPrivacyPanel user={user} />
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

function UnlockForm({ userId, moduleId, op, children }: { userId: string; moduleId: string; op: "unlock" | "lock"; children: React.ReactNode }) {
  return (
    <form action={changeModuleUnlock}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton className="btn-secondary px-3 py-1 text-xs" confirm={op === "unlock" ? "Deze module nu vrijgeven voor deze cursist, ook al is de vorige module nog niet af?" : undefined}>
        {children}
      </SubmitButton>
    </form>
  );
}

/** The first measurement a repeated assignment compares with: its last version, or its draft. */
function findOriginal(blockId: string, lessons: Lesson[], submissions: Submission[], versions: SubmissionVersion[]) {
  const sub = submissions.find((s) => s.blockId === blockId);
  const last = sub ? versions.filter((v) => v.submissionId === sub.id).sort((a, b) => b.version - a.version)[0] : undefined;
  if (last) return { assignment: last.assignment, answers: last.answers };
  const definition = lessons.flatMap((l) => assignmentsOf(l.blocks)).find((a) => a.id === blockId);
  return definition && sub ? { assignment: definition, answers: sub.draft } : null;
}
