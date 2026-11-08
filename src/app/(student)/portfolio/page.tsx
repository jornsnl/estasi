import { PortfolioView } from "@/components/academy/PortfolioView";
import { PrintAllButton } from "@/components/academy/PrintAllButton";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { expiryBanner, daysLeftText } from "@/lib/domain/expiry";
import { portfolioItemCount } from "@/lib/domain/portfolio";
import { plural } from "@/lib/domain/labels";
import { loadPortfolio } from "@/lib/portfolio";
import { formatDate } from "@/lib/util/format";

export const metadata = { title: "Mijn portfolio" };

/** Academy 10: the student's own portfolio. Always only their own (the session decides, never the link). */
export default async function PortfolioPage() {
  const user = await requireStudent();
  const [portfolio, enrollment] = await Promise.all([loadPortfolio(user.id, "student"), getStore().getEnrollmentForUser(user.id)]);
  const count = portfolioItemCount(portfolio);
  const days = expiryBanner(enrollment);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Mijn portfolio</p>
          <h1 className="mt-1 text-4xl">Al je opdrachten op één plek</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Je portfolio vult zich vanzelf: elke opdracht waar je aan begint, met de vragen, je antwoorden, je bestanden, de feedback
            van Sabine en al je eerdere versies. Alleen jij en Sabine kunnen het zien.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <a href="/api/portfolio" className="btn-primary" download>Download portfolio (zip)</a>
          <PrintAllButton />
        </div>
      </header>

      <div className="no-print card bg-cream/60 p-5 text-sm">
        <p>
          {plural(count, "opdracht", "opdrachten")} in je portfolio.
          {enrollment && ` Je toegang loopt tot en met ${formatDate(enrollment.endsAt)}${days !== null ? ` (${daysLeftText(days)})` : ""}.`}
        </p>
        <p className="mt-1 text-muted">
          De download is een zip-bestand met <strong>portfolio.html</strong> (opent in elke browser en kun je als pdf bewaren) en de map{" "}
          <strong>bestanden</strong> met al je uploads en de bijlagen bij je feedback. Losse bestanden download je ook door erop te klikken.
        </p>
      </div>

      <PortfolioView portfolio={portfolio} audience="student" studentId={user.id} />
    </div>
  );
}
