import Link from "next/link";
import { DraaiboekPrintView } from "@/app/k/[coupleId]/draaiboek/print/PrintView";
import { formatDate } from "@/lib/ws/format";
import { logView, requireStudentAccess } from "@/lib/ws/meekijkers";
import { draaiboekTitle, lastDay } from "@/lib/ws/meekijkers-pure";

export const dynamic = "force-dynamic";
export const metadata = { title: "Draaiboek", robots: { index: false } };

/**
 * The run sheet for a student who walks along (feedback 13.3): the print view
 * in read-only mode, without the couple's menu, print button or links into
 * their portal. Only with active access; every opening is logged.
 */
export default async function StudentRunSheet({ params }: { params: Promise<{ accessId: string }> }) {
  const { accessId } = await params;
  const { couple } = await requireStudentAccess(accessId);
  await logView(accessId);
  const until = lastDay(couple.wedding_date);

  return (
    <div className="ws-theme min-h-screen">
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="leading-tight">
            <span className="block font-serif text-lg font-semibold">Future Weddings Academy</span>
            <span className="eyebrow block text-[10px]">Meeloopbruiloft</span>
          </div>
          <Link href="/dashboard" className="btn-secondary py-1.5 text-sm">← Terug naar je dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-16">
        <div className="no-print mb-4">
          <h1 className="text-2xl sm:text-3xl">{draaiboekTitle(couple)}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(couple.wedding_date)}
            {couple.location ? ` · ${couple.location}` : ""}
          </p>
          <p className="mt-2 max-w-2xl rounded-lg bg-gold-soft p-3 text-sm text-gold-ink">
            Je kijkt mee met toestemming van het bruidspaar. Alles is alleen te lezen. Contactgegevens van gasten en leveranciers, kosten en speeches zie je niet.
            {until ? ` Je kunt het draaiboek bekijken tot en met ${formatDate(until)}.` : ""}
          </p>
        </div>
        <p className="hidden print:block">Dit draaiboek is alleen op het scherm te bekijken.</p>
        <div className="overflow-x-auto rounded-xl">
          <DraaiboekPrintView couple={couple} viewer="student" searchParams={{}} fileBase={`/api/draaiboek/${accessId}/bestand/`} />
        </div>
      </main>
    </div>
  );
}
