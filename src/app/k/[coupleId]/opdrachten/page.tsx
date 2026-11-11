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

      {/* Feedback Sabine (19): the same layout as Aanraders, a square tile per assignment with a photo, the title and the status. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {assignments.map((a) => {
          const hidden = a.visible_from && a.visible_from > new Date().toISOString().slice(0, 10);
          const unit = a.kind === "sections" ? "opdrachten afgerond" : "vragen ingevuld";
          return (
            <li key={a.id}>
              <Link
                href={`/k/${couple.id}/opdrachten/${a.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <span className="relative block aspect-square w-full overflow-hidden bg-gradient-to-br from-cream-deep to-[#e2d6b8]">
                  {a.photo_file_id && (
                    // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
                    <img src={`/api/ws-bestanden/${a.photo_file_id}`} alt="" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]" />
                  )}
                  {a.submitted_at && <span className="absolute top-2 right-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] text-success shadow-sm">Ingestuurd</span>}
                </span>
                <span className="block p-3">
                  <span className="block font-serif text-base leading-tight font-semibold">{a.title}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {a.answered} van {a.total} {unit}
                    {isAdmin && hidden ? ` · zichtbaar vanaf ${formatDate(a.visible_from)}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {assignments.length === 0 && <li className="card col-span-full p-5 text-sm text-muted">Er staan nog geen opdrachten klaar.</li>}
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
