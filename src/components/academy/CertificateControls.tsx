import Link from "next/link";
import { changeCompletion } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";
import type { Enrollment } from "@/lib/data/types";
import { practicalCertificateReadiness } from "@/lib/domain/feedback";
import { formatDate } from "@/lib/util/format";

/**
 * The two certificates on the student page (Academy 15): the online
 * certificate, which can be released once the modules of the package and the
 * final assignments are done, and the practical certificate (package B, after
 * the shadow wedding). Both stay a deliberate step of the owner.
 */
export function CertificateControls({ userId, enrollment, onlineMissing }: { userId: string; enrollment: Enrollment; onlineMissing: string[] }) {
  const practical = practicalCertificateReadiness(enrollment);
  return (
    <>
      <div className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            Online certificaat{" "}
            <Link href={`/beheer/certificaat?cursist=${userId}`} className="ml-1 text-sm font-normal text-bordeaux hover:underline">bekijken / pdf</Link>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {enrollment.certificateReleasedAt ? (
              <>
                <span>Vrijgegeven op {formatDate(enrollment.certificateReleasedAt)} ({enrollment.certificateCode})</span>
                <Op userId={userId} op="withdrawCertificate" confirm="Certificaat intrekken?">Intrekken</Op>
              </>
            ) : (
              <Op userId={userId} op="releaseCertificate" primary disabled={onlineMissing.length > 0}>Certificaat vrijgeven</Op>
            )}
          </span>
        </div>
        {!enrollment.certificateReleasedAt && <Missing items={onlineMissing} ready="Alles is afgerond: je kunt het certificaat vrijgeven." />}
      </div>
      {enrollment.package === "B" && (
        <div className="border-b border-line pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              Praktijkcertificaat{" "}
              <Link href={`/beheer/certificaat?soort=praktijk&cursist=${userId}`} className="ml-1 text-sm font-normal text-bordeaux hover:underline">bekijken / pdf</Link>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {enrollment.practicalCertificateReleasedAt ? (
                <>
                  <span>Vrijgegeven op {formatDate(enrollment.practicalCertificateReleasedAt)} ({enrollment.practicalCertificateCode})</span>
                  <Op userId={userId} op="withdrawPractical" confirm="Praktijkcertificaat intrekken?">Intrekken</Op>
                </>
              ) : (
                <Op userId={userId} op="releasePractical" primary disabled={!practical.ready}>Praktijkcertificaat vrijgeven</Op>
              )}
            </span>
          </div>
          {!enrollment.practicalCertificateReleasedAt && (
            <Missing items={practical.missing} ready="De meeloopbruiloft is afgerond: je kunt het praktijkcertificaat vrijgeven." />
          )}
        </div>
      )}
    </>
  );
}

function Missing({ items, ready }: { items: string[]; ready: string }) {
  if (items.length === 0) return <p className="mt-1 text-xs text-success">{ready}</p>;
  return (
    <div className="mt-2 text-xs text-muted">
      <p>Nog niet mogelijk:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

function Op({
  userId,
  op,
  children,
  primary,
  disabled,
  confirm,
}: {
  userId: string;
  op: string;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  confirm?: string;
}) {
  const className = primary ? "btn-primary" : "btn-secondary px-3 py-1.5 text-xs";
  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        {children}
      </button>
    );
  }
  return (
    <form action={changeCompletion}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton className={className} confirm={confirm}>
        {children}
      </SubmitButton>
    </form>
  );
}
