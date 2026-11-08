import { deleteStudentAccount } from "@/app/actions/privacy";
import { SubmitButton } from "@/components/SubmitButton";
import type { User } from "@/lib/data/types";

/** Academy 16: export everything about a student (request for access) or delete the student for good. */
export function StudentPrivacyPanel({ user }: { user: User }) {
  return (
    <section id="verwijderen" className="card p-6" aria-labelledby="privacy-titel">
      <h2 id="privacy-titel" className="text-2xl">Privacy (AVG)</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-base font-semibold">Gegevens exporteren</h3>
          <p className="mt-1 text-sm text-muted">
            Voor een inzageverzoek: een zip met alles wat de Academy over {user.name} bewaart. Profiel, inschrijving en notities,
            opdrachten met alle versies, feedback, community-berichten, privéberichten, mails, logboekregels en alle bestanden.
          </p>
          <a href={`/api/beheer/inzage/${user.id}`} className="btn-secondary mt-3" download>Alle gegevens downloaden (zip)</a>
        </div>
        <form action={deleteStudentAccount} className="space-y-3 rounded-lg border border-bordeaux/30 bg-bordeaux-soft/30 p-4">
          <input type="hidden" name="userId" value={user.id} />
          <h3 className="text-base font-semibold text-bordeaux">Cursist definitief verwijderen</h3>
          <p className="text-sm">
            Verwijdert het account, het profiel, de inschrijving, alle opdrachten, versies en feedback, alle bestanden, de privéberichten en de
            community-berichten en reacties van deze cursist (met de reacties van anderen daaronder), meekijktoegang, pushmeldingen,
            mails in de mailgeschiedenis en de logboekregels. Dit is niet terug te draaien. Download eventueel eerst de gegevens.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmed" required className="mt-1" />
            <span>Ik begrijp dat alles van {user.name} definitief verdwijnt.</span>
          </label>
          <div>
            <label htmlFor="confirmEmail" className="label">Typ ter bevestiging het e-mailadres: {user.email}</label>
            <input id="confirmEmail" name="confirmEmail" type="email" required autoComplete="off" className="input" />
          </div>
          <SubmitButton className="btn-danger" pendingText="Verwijderen…" confirm={`Weet je het zeker? ${user.name} en alle gegevens worden definitief verwijderd.`}>
            Definitief verwijderen
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
