import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { requireOwner } from "@/lib/auth/session";
import { listConversations, viewerFor } from "@/lib/community/server";
import { preview } from "@/lib/community/rules";
import { getStore } from "@/lib/data";
import { formatDateTime } from "@/lib/util/format";

export const metadata = { title: "Privéberichten" };

type Search = Record<string, string | string[] | undefined>;

async function openConversation(formData: FormData) {
  "use server";
  await requireOwner();
  const id = String(formData.get("studentId") ?? "");
  redirect(id ? `/beheer/berichten/${id}` : "/beheer/berichten");
}

export default async function OwnerMessagesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await viewerFor(await requireOwner());
  const [conversations, students] = await Promise.all([listConversations(viewer), getStore().listUsers("student")]);
  const withConversation = new Set(conversations.map((c) => c.studentId));
  const others = students.filter((s) => !withConversation.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, "nl"));

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Academy</p>
      <h1 className="mt-1 mb-2 text-4xl">Privéberichten</h1>
      <p className="mb-6 text-sm text-muted">Eén gesprek per cursist. Alleen jij en die cursist zien het.</p>
      <Notice searchParams={searchParams} />

      {others.length > 0 && (
        <form action={openConversation} className="card mb-6 flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-0 flex-1">
            <label htmlFor="nieuw-gesprek" className="label">
              Nieuw gesprek met
            </label>
            <select id="nieuw-gesprek" name="studentId" className="input" required defaultValue="">
              <option value="" disabled>
                Kies een cursist
              </option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Openen
          </button>
        </form>
      )}

      {conversations.length === 0 ? (
        <div className="card p-8 text-center text-muted">Nog geen privéberichten.</div>
      ) : (
        <ul className="card divide-y divide-line">
          {conversations.map((c) => (
            <li key={c.studentId}>
              <Link href={`/beheer/berichten/${c.studentId}`} className="flex items-start gap-3 px-5 py-4 hover:bg-cream">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={c.unread ? "font-semibold text-ink" : "text-ink"}>{c.name}</span>
                    {c.unread > 0 && <Badge tone="bordeaux">{c.unread} nieuw</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {c.lastFromStudent ? "" : "Jij: "}
                    {preview(c.lastBody, 90) || "(bijlage)"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(c.lastAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
