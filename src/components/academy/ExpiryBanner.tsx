import Link from "next/link";
import type { Enrollment } from "@/lib/data/types";
import { daysLeftText, expiryBanner } from "@/lib/domain/expiry";
import { formatDate } from "@/lib/util/format";

/** Academy 12: in the last 30 days of access, on every page of the Academy, with a way to the portfolio export. */
export function ExpiryBanner({ enrollment, contactEmail }: { enrollment: Enrollment | null; contactEmail: string }) {
  const days = expiryBanner(enrollment);
  if (days === null || !enrollment) return null;
  return (
    <div role="status" className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/50 bg-gold-soft/60 p-4 text-sm">
      <p>
        <span className="font-medium">Je toegang loopt af op {formatDate(enrollment.endsAt)} ({daysLeftText(days)}).</span>{" "}
        Bewaar je opdrachten, bestanden en feedback door je portfolio te downloaden.
        {contactEmail && (
          <>
            {" "}Langer toegang? Mail <a href={`mailto:${contactEmail}`} className="text-bordeaux underline">{contactEmail}</a>.
          </>
        )}
      </p>
      <Link href="/portfolio" className="btn-primary px-3 py-1.5 text-sm">Portfolio downloaden</Link>
    </div>
  );
}
