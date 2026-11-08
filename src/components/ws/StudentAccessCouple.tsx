import { answerStudentAccess, revokeStudentAccessCouple } from "@/app/actions/ws-meekijkers";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, formatDateTime } from "@/lib/ws/format";
import { accessesForCouple } from "@/lib/ws/meekijkers";
import { consentQuestion, lastDay } from "@/lib/ws/meekijkers-pure";
import type { Couple } from "@/lib/ws/types";

/**
 * On the couple's start page (feedback 13.2): Sabine's question about a
 * student who walks along, with Akkoord and Liever niet, and "Meekijkers" to
 * take the consent back later. Sabine sees the same, without the buttons.
 */
export async function StudentAccessCouple({ couple, isAdmin }: { couple: Couple; isAdmin: boolean }) {
  const accesses = await accessesForCouple(couple.id, couple.wedding_date);
  const open = accesses.filter((a) => a.state === "wacht");
  const active = accesses.filter((a) => a.state === "actief");
  if (open.length === 0 && active.length === 0) return null;
  const until = lastDay(couple.wedding_date);

  return (
    <div id="meekijkers" className="scroll-mt-6 space-y-4">
      {open.map((a) => {
        const [question, allergies] = consentQuestion(a.student_name);
        return (
          <section key={a.id} aria-label="Vraag van Sabine" className="rounded-2xl border border-gold/50 bg-white p-5 shadow-sm sm:p-6">
            <p className="eyebrow">Vraag van Sabine</p>
            <p className="mt-2 max-w-3xl text-[15px] leading-7">{question}</p>
            <p className="mt-2 max-w-3xl text-sm text-muted">{allergies}</p>
            {isAdmin ? (
              <p className="mt-3 text-xs text-muted">Het bruidspaar ziet deze vraag met de knoppen Akkoord en Liever niet. Alleen zij kunnen antwoorden.</p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={answerStudentAccess}>
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="accessId" value={a.id} />
                  <input type="hidden" name="answer" value="akkoord" />
                  <SubmitButton className="btn-primary" pendingText="Opslaan…">Akkoord</SubmitButton>
                </form>
                <form action={answerStudentAccess}>
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="accessId" value={a.id} />
                  <input type="hidden" name="answer" value="liever_niet" />
                  <SubmitButton className="btn-secondary" pendingText="Opslaan…">Liever niet</SubmitButton>
                </form>
              </div>
            )}
          </section>
        );
      })}

      {active.length > 0 && (
        <section aria-labelledby="meekijkers-titel" className="card p-5">
          <h2 id="meekijkers-titel" className="text-xl">Meekijkers</h2>
          <p className="mt-1 text-sm text-muted">
            Deze cursist{active.length === 1 ? "" : "en"} van de Estasi Academy {active.length === 1 ? "kan" : "kunnen"} jullie draaiboek lezen, maar niets aanpassen.
            {until ? ` De toegang stopt vanzelf na ${formatDate(until)}.` : ""} Jullie kunnen de toestemming altijd intrekken.
          </p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {active.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="font-medium">{a.student_name}</p>
                  <p className="text-xs text-muted">Akkoord gegeven {formatDateTime(a.decided_at)}{a.decided_by_name ? ` door ${a.decided_by_name}` : ""}</p>
                </div>
                {!isAdmin && (
                  <form action={revokeStudentAccessCouple}>
                    <input type="hidden" name="coupleId" value={couple.id} />
                    <input type="hidden" name="accessId" value={a.id} />
                    <SubmitButton className="btn-secondary py-1.5 text-xs" confirm={`Toestemming voor ${a.student_name} intrekken? Daarna kan de cursist het draaiboek niet meer bekijken.`}>
                      Toestemming intrekken
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
