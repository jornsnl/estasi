import { grantStudentAccess, revokeStudentAccessAdmin } from "@/app/actions/ws-meekijkers";
import { Badge } from "@/components/Badge";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, formatDateTime } from "@/lib/ws/format";
import { accessesForCouple, eligibleStudents, recentViews } from "@/lib/ws/meekijkers";
import { GRANT_CONFIRMATION, lastDay, STATE_TONES, stateLabel } from "@/lib/ws/meekijkers-pure";
import type { Couple } from "@/lib/ws/types";

/** "Meelopende cursist" at the couple, for Sabine (feedback 13.1, 13.4, 13.5). */
export async function StudentAccessAdmin({ couple }: { couple: Couple }) {
  const [accesses, students] = await Promise.all([accessesForCouple(couple.id, couple.wedding_date), eligibleStudents()]);
  const views = await recentViews(accesses.map((a) => a.id));
  const busy = new Set(accesses.filter((a) => a.state === "wacht" || a.state === "actief").map((a) => a.student_user_id));
  const choices = students.filter((s) => !busy.has(s.id));
  const eligible = new Set(students.map((s) => s.id));
  const until = lastDay(couple.wedding_date);

  return (
    <section id="meelopen" className="card scroll-mt-6 p-5">
      <h2 className="text-xl">Meelopende cursist</h2>
      <p className="mt-1 text-sm text-muted">
        Een cursist van de Academy met pakket B kan na akkoord van het bruidspaar het draaiboek lezen, zonder contactgegevens van gasten en leveranciers, kosten en speeches.
        {until ? ` De toegang stopt automatisch na ${formatDate(until)} (7 dagen na de trouwdatum).` : " Zonder trouwdatum stopt de toegang niet vanzelf."}
      </p>

      {accesses.length > 0 && (
        <ul className="mt-4 divide-y divide-line text-sm">
          {accesses.map((a) => {
            const own = views.filter((v) => v.access_id === a.id);
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{a.student_name} <span className="font-normal text-muted">· {a.student_email}</span></p>
                    <div className="mt-1"><Badge tone={STATE_TONES[a.state]}>{stateLabel(a.state, a.revoked_by)}</Badge></div>
                    {(a.state === "actief" || a.state === "wacht") && !eligible.has(a.student_user_id) && (
                      <p className="mt-1 text-xs text-bordeaux">Op dit moment geen toegang: de cursist heeft geen actief pakket B (gepauzeerd, verlopen of pakket A).</p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      Gevraagd {formatDateTime(a.created_at)}{a.granted_by_name ? ` door ${a.granted_by_name}` : ""}
                      {a.decided_at && ` · ${a.status === "declined" ? "Afgewezen" : "Akkoord"} ${formatDateTime(a.decided_at)} door ${a.decided_by_name || "het bruidspaar"}`}
                      {a.revoked_at && ` · Ingetrokken ${formatDateTime(a.revoked_at)}${a.revoked_by_name ? ` door ${a.revoked_by_name}` : ""}`}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {a.views === 0 ? "Nog niet bekeken." : `${a.views === 1 ? "1 keer" : `${a.views} keer`} bekeken, laatst ${formatDateTime(a.last_viewed_at)}.`}
                    </p>
                    {own.length > 0 && (
                      <details className="mt-1 text-xs text-muted">
                        <summary className="cursor-pointer text-bordeaux">Wanneer bekeken</summary>
                        <ul className="mt-1 list-disc pl-5">{own.map((v, i) => <li key={i}>{formatDateTime(v.viewed_at)}</li>)}</ul>
                        {a.views > own.length && <p className="mt-1">En {a.views - own.length} eerder.</p>}
                      </details>
                    )}
                  </div>
                  {(a.state === "wacht" || a.state === "actief") && (
                    <form action={revokeStudentAccessAdmin}>
                      <input type="hidden" name="coupleId" value={couple.id} />
                      <input type="hidden" name="accessId" value={a.id} />
                      <SubmitButton className="btn-secondary py-1.5 text-xs" confirm={`De toegang van ${a.student_name} intrekken?`}>
                        {a.state === "wacht" ? "Vraag intrekken" : "Toegang intrekken"}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-4 group">
        <summary className="btn-primary inline-flex cursor-pointer list-none">Cursist toegang geven</summary>
        {choices.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Er is geen cursist met pakket B en actieve toegang die nog geen toegang heeft bij dit bruidspaar.</p>
        ) : (
          <form action={grantStudentAccess} className="mt-3 space-y-3 rounded-xl border border-line p-4">
            <input type="hidden" name="coupleId" value={couple.id} />
            <label className="block text-sm">
              <span className="font-medium">Cursist</span>
              <select name="studentId" required className="input mt-1 w-full" defaultValue="">
                <option value="" disabled>Kies een cursist (pakket B)</option>
                {choices.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" required className="mt-1 accent-[#6B1E2E]" />
              <span>{GRANT_CONFIRMATION}</span>
            </label>
            <SubmitButton className="btn-primary" pendingText="Versturen…">Vraag versturen naar het bruidspaar</SubmitButton>
            {couple.status !== "active" && <p className="text-xs text-muted">Het portaal is nog niet gedeeld: het bruidspaar ziet de vraag pas na het delen.</p>}
          </form>
        )}
      </details>
    </section>
  );
}
