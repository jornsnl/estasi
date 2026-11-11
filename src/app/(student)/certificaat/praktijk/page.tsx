import Link from "next/link";
import { redirect } from "next/navigation";
import { Certificate } from "@/components/Certificate";
import { PrintButton } from "@/components/PrintButton";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { academyLogoSrc } from "@/lib/brand-logos";

export const metadata = { title: "Praktijkcertificaat" };

/** Academy 15: the practical certificate, after the owner released it by hand (package B, shadow wedding completed). */
export default async function PracticalCertificatePage() {
  const user = await requireStudent();
  const enrollment = await getStore().getEnrollmentForUser(user.id);
  if (!enrollment?.practicalCertificateReleasedAt || !enrollment.practicalCertificateCode) redirect("/dashboard");

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Gefeliciteerd</p>
          <h1 className="mt-1 text-4xl">Je praktijkcertificaat</h1>
        </div>
        <PrintButton />
      </div>
      {enrollment.certificateReleasedAt && (
        <p className="no-print mb-4 text-sm">
          Je online certificaat vind je <Link href="/certificaat" className="text-bordeaux underline">hier</Link>.
        </p>
      )}
      <Certificate kind="praktijk" name={user.name} date={enrollment.practicalCertificateReleasedAt} code={enrollment.practicalCertificateCode} logoSrc={await academyLogoSrc()} />
      <p className="no-print mt-4 text-sm text-muted">Kies in het printvenster bij de printer voor &quot;Opslaan als pdf&quot;. Het certificaat staat al liggend op één A4.</p>
    </div>
  );
}
