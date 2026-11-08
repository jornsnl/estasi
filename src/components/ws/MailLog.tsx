import Link from "next/link";
import { retryMail } from "@/app/actions/ws-mail";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/ws/db";
import { formatDateTime } from "@/lib/ws/format";
import { MAIL_KINDS, mailKindLabel } from "@/lib/ws/mail-format";

interface Row {
  id: string;
  couple_id: string | null;
  couple: string | null;
  guest_name: string;
  kind: string;
  to_email: string;
  subject: string;
  body: string;
  retryable: boolean;
  status: "sent" | "failed";
  error: string;
  attempts: number;
  sent_by_name: string;
  created_at: Date;
  updated_at: Date;
}

const STATUS = { sent: "Verstuurd", failed: "Mislukt" } as const;

/**
 * Feedback 5.5: the mail history. Sabine sees everything (and sends failed
 * mails again); a couple sees only its own, read only. Filters through the
 * address bar (?type=, ?status=), so they also work without JavaScript.
 */
export async function MailLog({
  coupleId,
  isAdmin,
  path,
  filters,
}: {
  /** One couple's history, or null for all (beheer). */
  coupleId: string | null;
  isAdmin: boolean;
  /** This page, for the filter form and to come back to after "Opnieuw versturen". */
  path: string;
  filters: Record<string, string | string[] | undefined>;
}) {
  const type = typeof filters.type === "string" && filters.type in MAIL_KINDS ? filters.type : "";
  const status = filters.status === "sent" || filters.status === "failed" ? filters.status : "";
  const rows = await query<Row>(
    `select m.*, case when c.id is null then null else concat_ws(' & ', nullif(c.partner1_first, ''), nullif(c.partner2_first, '')) end as couple
       from mail_log m left join couples c on c.id = m.couple_id
      where ($1::uuid is null or m.couple_id = $1) and ($2 = '' or m.kind = $2) and ($3 = '' or m.status = $3)
      order by m.created_at desc limit 500`,
    [coupleId, type, status],
  );
  const here = `${path}${type || status ? `?${new URLSearchParams({ ...(type ? { type } : {}), ...(status ? { status } : {}) })}` : ""}`;

  return (
    <div className="space-y-3">
      <form method="get" action={path} className="flex flex-wrap items-end gap-2 text-sm">
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={type} className="input py-1.5">
            <option value="">Alle typen</option>
            {Object.entries(MAIL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} className="input py-1.5">
            <option value="">Alle</option>
            <option value="sent">Verstuurd</option>
            <option value="failed">Mislukt</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary py-1.5">Filteren</button>
        {(type || status) && <Link href={path} className="py-1.5 text-muted hover:text-bordeaux">Wis filters</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="table-head">
            <tr>
              {coupleId === null && <th className="px-3 py-2.5">Bruidspaar</th>}
              <th className="px-3 py-2.5">Gast</th>
              <th className="px-3 py-2.5">E-mailadres</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Onderwerp</th>
              <th className="px-3 py-2.5">Datum en tijd</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-line align-top">
                {coupleId === null && (
                  <td className="px-3 py-2.5">{m.couple_id ? <Link href={`/k/${m.couple_id}/gasten/mails`} className="hover:text-bordeaux">{m.couple || "Bruidspaar"}</Link> : "–"}</td>
                )}
                <td className="px-3 py-2.5">{m.guest_name || "–"}</td>
                <td className="max-w-[14rem] px-3 py-2.5 break-words">{m.to_email}</td>
                <td className="px-3 py-2.5">{mailKindLabel(m.kind)}</td>
                <td className="px-3 py-2.5">
                  {m.body ? (
                    <details>
                      <summary className="cursor-pointer">{m.subject}</summary>
                      <p className="mt-2 max-w-md rounded-lg bg-cream p-3 text-xs whitespace-pre-line">{m.body}</p>
                    </details>
                  ) : (
                    m.subject
                  )}
                  {m.sent_by_name && <span className="block text-xs text-muted">door {m.sent_by_name}</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {formatDateTime(m.created_at)}
                  {m.attempts > 1 && <span className="block text-xs text-muted">{m.attempts}e poging {formatDateTime(m.updated_at)}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${m.status === "sent" ? "bg-success-soft text-success" : "bg-bordeaux-soft text-bordeaux"}`}>{STATUS[m.status]}</span>
                  {m.status === "failed" && m.error && <span className="mt-1 block max-w-[16rem] text-xs text-muted">{m.error}</span>}
                  {isAdmin && m.status === "failed" && (
                    m.retryable && m.body ? (
                      <form action={retryMail} className="mt-1">
                        <input type="hidden" name="mailId" value={m.id} />
                        <input type="hidden" name="back" value={here} />
                        <SubmitButton className="text-xs text-bordeaux underline" pendingText="Versturen…">Opnieuw versturen</SubmitButton>
                      </form>
                    ) : (
                      <span className="mt-1 block text-xs text-muted">Met inloglink: stuur een nieuwe via Gegevens &amp; delen.</span>
                    )
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={coupleId === null ? 7 : 6} className="px-4 py-6 text-center text-muted">{type || status ? "Geen mails met deze filters." : "Nog geen mails verstuurd."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length === 500 && <p className="text-xs text-muted">De nieuwste 500 mails staan hier. Gebruik de filters om verder te zoeken.</p>}
    </div>
  );
}
