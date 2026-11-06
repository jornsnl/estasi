import { Notice } from "@/components/Notice";
import { DocumentsSection } from "@/components/ws/DocumentsSection";
import { requireCouple } from "@/lib/ws/access";

export const metadata = { title: "Facturen & Offertes" };

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Facturen & Offertes</h1>
        <p className="mt-1 text-sm text-muted">Offertes en facturen van Estasi Weddings, om te openen en te downloaden.</p>
      </header>
      <Notice searchParams={searchParams} />
      <DocumentsSection coupleId={couple.id} section="invoices" isAdmin={isAdmin} empty="Nog geen facturen of offertes." />
    </div>
  );
}
