import { redirect } from "next/navigation";
import { Certificate } from "@/components/Certificate";
import { PrintButton } from "@/components/PrintButton";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";

export const metadata = { title: "Certificaat" };

export default async function CertificatePage() {
  const user = await requireStudent();
  const enrollment = await getStore().getEnrollmentForUser(user.id);
  // Only visible after the owner personally released it.
  if (!enrollment?.certificateReleasedAt || !enrollment.certificateCode) redirect("/dashboard");

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Gefeliciteerd</p>
          <h1 className="mt-1 text-4xl">Je online certificaat</h1>
        </div>
        <PrintButton />
      </div>
      <Certificate name={user.name} date={enrollment.certificateReleasedAt} code={enrollment.certificateCode} />
      <p className="no-print mt-4 text-sm text-muted">Tip: kies bij het printen voor &quot;Opslaan als pdf&quot; en liggende oriëntatie.</p>
    </div>
  );
}
