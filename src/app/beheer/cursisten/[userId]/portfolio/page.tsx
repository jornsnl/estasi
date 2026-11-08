import Link from "next/link";
import { notFound } from "next/navigation";
import { PortfolioView } from "@/components/academy/PortfolioView";
import { PrintAllButton } from "@/components/academy/PrintAllButton";
import { requireOwner } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { portfolioItemCount } from "@/lib/domain/portfolio";
import { plural } from "@/lib/domain/labels";
import { loadPortfolio } from "@/lib/portfolio";

export const metadata = { title: "Portfolio cursist" };

/** Academy 10 and 13: Sabine sees the portfolio of every student, including feedback she has not sent yet. */
export default async function StudentPortfolio({ params }: { params: Promise<{ userId: string }> }) {
  await requireOwner();
  const { userId } = await params;
  const user = await getStore().getUser(userId);
  if (!user || user.role !== "student") notFound();
  const portfolio = await loadPortfolio(user.id, "owner");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/beheer/cursisten/${user.id}`} className="no-print text-sm text-muted hover:text-bordeaux">← {user.name}</Link>
          <h1 className="mt-3 text-4xl">Portfolio van {user.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {plural(portfolioItemCount(portfolio), "opdracht", "opdrachten")}. Precies wat de cursist ziet, plus feedback die je nog niet hebt verstuurd.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <a href={`/api/portfolio?cursist=${user.id}`} className="btn-primary" download>Download portfolio (zip)</a>
          <PrintAllButton />
        </div>
      </header>
      <PortfolioView portfolio={portfolio} audience="owner" studentId={user.id} />
    </div>
  );
}
