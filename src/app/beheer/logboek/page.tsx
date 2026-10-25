import Link from "next/link";
import { getStore } from "@/lib/data";
import { formatDateTime } from "@/lib/util/format";

export const metadata = { title: "Logboek" };

export default async function AuditPage() {
  const store = getStore();
  const [entries, users] = await Promise.all([store.listAudit(), store.listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div>
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 mb-2 text-4xl">Logboek</h1>
      <p className="mb-8 text-muted">Alle beheeracties: toegang, afronding, certificaten en inhoud.</p>
      <div className="card divide-y divide-line">
        {entries.map((e) => (
          <div key={e.id} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <span className="w-36 shrink-0 text-muted">{formatDateTime(e.at)}</span>
            <span className="flex-1">
              {e.action}
              {e.details && <span className="text-muted"> · {e.details}</span>}
            </span>
            {e.targetUserId && (
              <Link href={`/beheer/cursisten/${e.targetUserId}`} className="text-bordeaux hover:underline">
                {names.get(e.targetUserId) ?? "Onbekend"}
              </Link>
            )}
            <span className="text-muted">door {names.get(e.actorId) ?? "?"}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="px-5 py-10 text-center text-muted">Nog geen acties.</p>}
      </div>
    </div>
  );
}
