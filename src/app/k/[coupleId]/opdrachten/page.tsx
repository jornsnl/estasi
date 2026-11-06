import Link from "next/link";
import { manageAssignment } from "@/app/actions/ws-fase2";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requirePlanning } from "@/lib/ws/access";
import { assignmentsFor } from "@/lib/ws/assignments";
import { query } from "@/lib/ws/db";
import { formatDate } from "@/lib/ws/format";

export const metadata = { title: "Opdrachten" };

export default async function Assignments({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const [assignments, templates] = await Promise.all([
    assignmentsFor(couple.id, isAdmin),
    isAdmin ? query<{ id: string; title: string }>("select id, title from assignment_templates where not archived order by position") : [],
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Opdrachten</h1>
        <p className="mt-1 text-sm text-muted">Kleine huiswerkopdrachten. Vul jullie antwoorden in wanneer het jullie uitkomt; tussentijds opslaan kan altijd.</p>
      </header>
      <Notice searchParams={searchParams} />

      <ul className="space-y-3">
        {assignments.map((a) => {
          const hidden = a.visible_from && a.visible_from > new Date().toISOString().slice(0, 10);
          return (
            <li key={a.id}>
              <Link href={`/k/${couple.id}/opdrachten/${a.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 transition hover:shadow-md">
                <div>
                  <h2 className="text-lg">{a.title}</h2>
                  <p className="text-sm text-muted">
                    {a.answered} van {a.total} vragen ingevuld
                    {isAdmin && hidden ? ` · zichtbaar vanaf ${formatDate(a.visible_from)}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${a.submitted_at ? "bg-success-soft text-success" : "bg-cream text-gold-ink"}`}>
                  {a.submitted_at ? "Ingestuurd" : "Nog open"}
                </span>
              </Link>
            </li>
          );
        })}
        {assignments.length === 0 && <li className="card p-5 text-sm text-muted">Er staan nog geen opdrachten klaar.</li>}
      </ul>

      {isAdmin && (
        <section className="card flex flex-wrap items-end gap-3 p-5">
          <form action={manageAssignment} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="coupleId" value={couple.id} />
            <input type="hidden" name="intent" value="fromTemplate" />
            <div>
              <label className="label" htmlFor="templateId">Opdracht toevoegen</label>
              <select id="templateId" name="templateId" className="input">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <SubmitButton className="btn-primary">Toevoegen</SubmitButton>
          </form>
          <form action={manageAssignment}>
            <input type="hidden" name="coupleId" value={couple.id} />
            <input type="hidden" name="intent" value="blank" />
            <SubmitButton className="btn-secondary">Lege opdracht maken</SubmitButton>
          </form>
          <Link href="/beheer/bruidsparen/opdrachten" className="text-sm text-bordeaux hover:underline">Standaardopdrachten beheren</Link>
        </section>
      )}
    </div>
  );
}
