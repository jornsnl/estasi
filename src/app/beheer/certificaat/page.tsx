import Link from "next/link";
import { Certificate } from "@/components/Certificate";
import { PrintButton } from "@/components/PrintButton";
import { requireOwner } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { isUuid } from "@/lib/ws/db";

export const metadata = { title: "Voorbeeldcertificaat" };

/**
 * Beheer: the certificate as a student gets it, to look at and to save as a
 * pdf, without releasing anything. With ?cursist= it carries that student's
 * name (and number once released); without it a sample name.
 */
export default async function CertificatePreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const params = await searchParams;
  const kind = params.soort === "praktijk" ? "praktijk" : "online";
  const userId = typeof params.cursist === "string" && isUuid(params.cursist) ? params.cursist : null;
  const store = getStore();
  const [user, enrollment] = userId ? await Promise.all([store.getUser(userId), store.getEnrollmentForUser(userId)]) : [null, null];
  const year = new Date().getFullYear();
  const released = kind === "praktijk" ? enrollment?.practicalCertificateReleasedAt : enrollment?.certificateReleasedAt;
  const code = (kind === "praktijk" ? enrollment?.practicalCertificateCode : enrollment?.certificateCode) ?? `${kind === "praktijk" ? "FWP" : "FWA"}-${year}-VOORBEELD`;
  const query = (soort: string) => `?soort=${soort}${userId ? `&cursist=${userId}` : ""}`;

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Beheer</p>
          <h1 className="mt-1 text-4xl">Voorbeeldcertificaat</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Zo ziet een cursist het certificaat. {user ? `Op naam van ${user.name}${released ? "" : "; nog niet vrijgegeven, dus met een voorbeeldnummer"}.` : "Met een voorbeeldnaam."} Er wordt
            niets vrijgegeven of opgeslagen.
          </p>
        </div>
        <PrintButton label="Download als pdf" />
      </div>
      <nav aria-label="Soort certificaat" className="no-print mb-6 flex gap-2 text-sm">
        {(["online", "praktijk"] as const).map((k) => (
          <Link key={k} href={`/beheer/certificaat${query(k)}`} aria-current={k === kind ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 ${k === kind ? "bg-bordeaux text-white" : "bg-white hover:bg-cream-deep"}`}>
            {k === "online" ? "Online certificaat" : "Praktijkcertificaat"}
          </Link>
        ))}
      </nav>
      <Certificate kind={kind} name={user?.name ?? "Voorbeeld Cursist"} date={released ?? new Date().toISOString()} code={code} />
      <p className="no-print mt-4 text-sm text-muted">Kies in het printvenster bij de printer voor &quot;Opslaan als pdf&quot;. Het certificaat staat al liggend op één A4.</p>
    </div>
  );
}
