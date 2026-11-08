import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoPrint } from "@/components/AutoPrint";
import { PrintButton } from "@/components/PrintButton";
import { SpeechPrintTable } from "@/components/ws/SpeechPrint";
import { requireOwner } from "@/lib/auth/session";
import { isUuid, one } from "@/lib/ws/db";
import { formatDate } from "@/lib/ws/format";
import { speechesFor } from "@/lib/ws/speeches";
import { speechesTitle } from "@/lib/ws/speeches-pure";
import type { Couple } from "@/lib/ws/types";

const coupleOf = async (coupleId: string) => (isUuid(coupleId) ? one<Couple>("select * from couples where id = $1", [coupleId]) : null);

// The document title is the name the browser gives the PDF: "Speeches Anna en Bram".
export async function generateMetadata({ params }: { params: Promise<{ coupleId: string }> }): Promise<Metadata> {
  await requireOwner();
  const couple = await coupleOf((await params).coupleId);
  return { title: { absolute: couple ? speechesTitle(couple) : "Speeches" } };
}

/** "Speechlijst printen / downloaden als PDF" (feedback 12.3): one compact A4 page. Sabine only. */
export default async function SpeechesPrint({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  const couple = await coupleOf((await params).coupleId);
  if (!couple) notFound();
  const speeches = await speechesFor(couple.id);
  const names = [couple.partner1_first, couple.partner2_first].filter(Boolean).join(" en ");

  return (
    <div className="print-sheet mx-auto max-w-3xl space-y-4 bg-white p-4 text-[12px] leading-snug print:max-w-none print:p-0">
      {(await searchParams).print === "1" && <AutoPrint />}
      <div className="no-print flex flex-wrap gap-2">
        <Link href={`/beheer/bruidsparen/speeches/${couple.id}`} className="btn-secondary">← Terug</Link>
        <PrintButton label="Printen of opslaan als pdf" />
      </div>
      <header>
        <p className="eyebrow">Speechlijst</p>
        <h1 className="mt-1 text-2xl">{names}</h1>
        <p className="text-sm">{couple.wedding_date ? formatDate(couple.wedding_date) : "Trouwdatum nog niet bekend"}{couple.location ? ` · ${couple.location}` : ""}</p>
      </header>
      <SpeechPrintTable speeches={speeches} />
    </div>
  );
}
