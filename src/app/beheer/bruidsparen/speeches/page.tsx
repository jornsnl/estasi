import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requireOwner } from "@/lib/auth/session";
import { query } from "@/lib/ws/db";
import { coupleName, countdownLabel, formatDate, todayIso } from "@/lib/ws/format";
import { byNextWedding, isIncomplete } from "@/lib/ws/speeches-pure";

export const metadata = { title: "Speeches" };

/** Speeches (feedback 12): all couples, the next wedding first. Sabine only (the /beheer layout checks too). */
export default async function SpeechesOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const showArchived = (await searchParams).archief === "1";
  const [rows, speeches] = await Promise.all([
    query<{ id: string; partner1_first: string; partner2_first: string; wedding_date: string | null; status: string }>(
      "select id, partner1_first, partner2_first, wedding_date, status from couples where $1 or status <> 'archived'",
      [showArchived],
    ),
    query<{ couple_id: string; planned_time: string; status: string }>("select couple_id, planned_time, status from speeches"),
  ]);
  const count = (id: string) => speeches.filter((s) => s.couple_id === id);
  const couples = byNextWedding(rows, todayIso());

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Speeches</h1>
        <p className="mt-1 text-sm text-muted">Alleen voor jou: bruidsparen zien de speeches nooit, ook niet als je met ze meekijkt. Een speech kan een verrassing zijn.</p>
      </header>
      <Notice searchParams={searchParams} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="table-head">
            <tr><th className="px-4 py-2.5">Bruidspaar</th><th className="px-4 py-2.5">Trouwdatum</th><th className="px-4 py-2.5 text-right">Speeches</th><th className="px-4 py-2.5 text-right">Nog niet compleet</th></tr>
          </thead>
          <tbody>
            {couples.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link href={`/beheer/bruidsparen/speeches/${c.id}`} className="font-medium hover:text-bordeaux">{coupleName(c)}</Link>
                  {c.status === "archived" && <span className="ml-2 rounded-full bg-cream-deep px-1.5 text-xs text-muted">gearchiveerd</span>}
                </td>
                <td className="px-4 py-3">
                  {c.wedding_date ? formatDate(c.wedding_date) : "–"}
                  {c.wedding_date && c.wedding_date >= todayIso() && countdownLabel(c.wedding_date) && <p className="text-xs text-muted">over {countdownLabel(c.wedding_date)}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{count(c.id).length}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {count(c.id).filter(isIncomplete).length > 0 ? (
                    <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs text-gold-ink">{count(c.id).filter(isIncomplete).length}</span>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
            {couples.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">Nog geen bruidsparen.</td></tr>}
          </tbody>
        </table>
      </div>
      <Link href={showArchived ? "/beheer/bruidsparen/speeches" : "/beheer/bruidsparen/speeches?archief=1"} className="text-sm text-muted hover:text-bordeaux">
        {showArchived ? "Gearchiveerde bruidsparen verbergen" : "Ook gearchiveerde bruidsparen tonen"}
      </Link>
    </div>
  );
}
