import type { Enrollment } from "@/lib/data";
import { accessStatus, remainingDays } from "@/lib/domain/access";
import { formatDate } from "@/lib/util/format";

/** Clear message for students whose lessons are currently closed. */
export function AccessNotice({ enrollment, contactEmail }: { enrollment: Enrollment | null; contactEmail: string }) {
  const status = enrollment ? accessStatus(enrollment) : "none";
  if (status === "active") return null;

  const text: Record<string, { title: string; body: string }> = {
    none: { title: "Nog geen toegang", body: "Er is nog geen opleiding aan je account gekoppeld." },
    paused: {
      title: "Je toegang staat op pauze",
      body: `Je resterende tijd (${enrollment ? remainingDays(enrollment) : 0} dagen) staat stil. Zodra je toegang weer wordt hervat, schuift je einddatum mee.`,
    },
    expired: {
      title: "Je toegang is verlopen",
      body: `Je toegang liep tot ${formatDate(enrollment?.endsAt)}. Je account blijft bestaan, maar lessen en opdrachten zijn gesloten.`,
    },
    revoked: { title: "Je toegang is beëindigd", body: "De lessen en opdrachten zijn niet meer beschikbaar." },
  };
  const { title, body } = text[status];

  return (
    <div className="card border-bordeaux/20 bg-bordeaux-soft/60 p-6">
      <h2 className="text-2xl text-bordeaux">{title}</h2>
      <p className="mt-2 text-ink">{body}</p>
      <p className="mt-3 text-sm text-muted">
        Vragen hierover? Mail{" "}
        <a href={`mailto:${contactEmail}`} className="text-bordeaux underline">
          {contactEmail}
        </a>
        .
      </p>
    </div>
  );
}
