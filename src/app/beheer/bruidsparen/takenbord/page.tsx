import Link from "next/link";
import { toggleTask } from "@/app/actions/ws-portal";
import { Notice } from "@/components/Notice";
import { query } from "@/lib/ws/db";
import { coupleName, formatDate, todayIso } from "@/lib/ws/format";

export const metadata = { title: "Mijn takenbord" };

interface Row {
  id: string;
  title: string;
  deadline: string | null;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
  wedding_date: string | null;
}

/**
 * Everything in the "Sabine" column of every couple's board, on one board,
 * grouped per couple (h9.5). Ticking it off here ticks it off in the portal.
 */
export default async function SabineBoard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rows = await query<Row>(
    `select t.id, t.title, t.deadline, c.id as couple_id, c.partner1_first, c.partner2_first, c.wedding_date
       from tasks t join couples c on c.id = t.couple_id
      where t.lane = 'sabine' and t.done_at is null and c.status <> 'archived'
      order by c.wedding_date nulls last, c.id, t.deadline nulls last, t.position`,
  );
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.couple_id, [...(groups.get(row.couple_id) ?? []), row]);
  const today = todayIso();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Mijn takenbord</h1>
        <p className="mt-1 text-sm text-muted">Alle taken in de kolom &quot;Sabine&quot; van alle bruidsparen. Afvinken hier vinkt ze ook af in het portaal.</p>
      </header>
      <Notice searchParams={searchParams} />
      {groups.size === 0 && <p className="card p-6 text-muted">Geen open taken. Heerlijk.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...groups.values()].map((tasks) => {
          const c = tasks[0];
          return (
            <section key={c.couple_id} className="rounded-2xl bg-cream-deep/70 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <Link href={`/k/${c.couple_id}#takenlijst`} className="font-serif font-semibold hover:text-bordeaux">{coupleName(c)}</Link>
                <span className="text-xs text-muted">{formatDate(c.wedding_date)}</span>
              </div>
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 rounded-lg bg-white p-2.5 text-sm shadow-sm">
                    <form action={toggleTask}>
                      <input type="hidden" name="coupleId" value={c.couple_id} />
                      <input type="hidden" name="taskId" value={t.id} />
                      <input type="hidden" name="back" value="/beheer/bruidsparen/takenbord" />
                      <button type="submit" aria-label={`${t.title} afvinken`} title="Afvinken" className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gold hover:bg-gold/20" />
                    </form>
                    <div>
                      <p>{t.title}</p>
                      {t.deadline && <p className={`text-xs ${t.deadline < today ? "text-bordeaux" : "text-muted"}`}>{formatDate(t.deadline, false)}{t.deadline < today ? " · te laat" : ""}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">Nieuwe taken voor jezelf zet je in de kolom &quot;Sabine&quot; op de takenlijst van het bruidspaar.</p>
    </div>
  );
}
