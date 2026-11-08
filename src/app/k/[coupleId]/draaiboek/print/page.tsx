import { requirePlanning } from "@/lib/ws/access";
import { DraaiboekPrintView } from "./PrintView";

export const metadata = { title: "Draaiboek (print)" };

/** "Draaiboek printen" for Sabine and the couple; what each sees is decided in the view (feedback 13.5). */
export default async function RunSheetPrint({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  return <DraaiboekPrintView couple={couple} viewer={isAdmin ? "admin" : "couple"} searchParams={await searchParams} />;
}
