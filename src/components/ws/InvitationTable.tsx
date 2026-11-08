"use client";

import { useState, useTransition } from "react";
import { confirmInvitationResponse, deleteInvitation, setInvitationChildren, updateInvitation } from "@/app/actions/ws-invitations";
import { partyLabel } from "@/lib/ws/guest-counts";

export interface InvitationData {
  id: string;
  names: string;
  party_size: number;
  group_id: string | null;
  address: string;
  email: string;
  send_via: "post" | "mail";
  sent: boolean;
  responded: "yes" | "maybe" | "no";
  match_id: string | null;
  candidate?: string;
  children: string[];
}

/** "Aantal kinderen" with a name field per child, for the form "Huishouden toevoegen". */
export function ChildrenFields() {
  const [count, setCount] = useState(0);
  return (
    <div className="space-y-2 sm:col-span-2">
      <label className="flex items-center gap-2 text-sm">
        Aantal kinderen
        <input name="kids" type="number" min={0} max={50} value={count} onChange={(e) => setCount(Math.max(0, Math.min(50, Math.round(Number(e.target.value)) || 0)))} className="input w-20 py-1" />
        <span className="text-xs text-muted">tellen mee in het aantal personen</span>
      </label>
      {count > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: count }, (_, i) => (
            <input key={i} name={`child_${i}`} placeholder={`Naam kind ${i + 1}`} aria-label={`Naam kind ${i + 1}`} className="input py-1.5" />
          ))}
        </div>
      )}
    </div>
  );
}

/** The children of one household in the table: a number, and a name per child. Saved at once. */
function ChildrenCell({ coupleId, row, partySize, onSaved }: { coupleId: string; row: InvitationData; partySize: number; onSaved: (count: number, msg: string) => void }) {
  const [names, setNames] = useState<string[]>(row.children);
  const [, start] = useTransition();
  const save = (next: string[]) => {
    const before = names;
    start(async () => {
      const result = await setInvitationChildren(coupleId, row.id, next);
      if (!result.ok) setNames(before);
      onSaved(result.ok ? next.length : before.length, result.ok ? "✓ Opgeslagen" : result.error ?? "Niet opgeslagen");
    });
  };
  const setCount = (n: number) => {
    const count = Math.max(0, Math.min(partySize, Math.round(n) || 0));
    if (count === names.length) return;
    const next = count > names.length ? [...names, ...Array.from({ length: count - names.length }, () => "")] : names.slice(0, count);
    setNames(next);
    save(next);
  };
  return (
    <div className="space-y-1">
      <input type="number" min={0} max={partySize} value={names.length} onChange={(e) => setCount(Number(e.target.value))} aria-label={`Aantal kinderen ${row.names}`} className="input w-16 py-1 text-sm" />
      {names.map((n, i) => (
        <input
          key={i}
          defaultValue={n}
          placeholder={`Naam kind ${i + 1}`}
          aria-label={`Naam kind ${i + 1} van ${row.names}`}
          onBlur={(e) => {
            if (e.target.value === names[i]) return;
            const next = names.map((x, j) => (j === i ? e.target.value : x));
            setNames(next);
            save(next);
          }}
          className="input min-w-32 py-1 text-sm"
        />
      ))}
    </div>
  );
}

/** The invitation list: every cell can be changed in place and is saved at once. */
export function InvitationTable({ coupleId, rows, groups }: { coupleId: string; rows: InvitationData[]; groups: { id: string; name: string }[] }) {
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sent, setSent] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, r.sent])));
  const [sizes, setSizes] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.party_size])));
  const [kids, setKids] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.children.length])));
  const [message, setMessage] = useState("");
  const [, start] = useTransition();

  const save = (id: string, field: Parameters<typeof updateInvitation>[2], value: string | boolean) =>
    start(async () => {
      const result = await updateInvitation(coupleId, id, field, value);
      setMessage(result.ok ? "✓ Opgeslagen" : result.error ?? "Niet opgeslagen");
    });
  const onBlur = (id: string, field: Parameters<typeof updateInvitation>[2]) => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value !== e.target.defaultValue) {
      save(id, field, e.target.value);
      e.target.defaultValue = e.target.value;
    }
  };

  const invited = rows.reduce((n, r) => n + (sizes[r.id] ?? r.party_size), 0);
  const invitedKids = rows.reduce((n, r) => n + (kids[r.id] ?? 0), 0);
  const cards = rows.filter((r) => sent[r.id]).length;
  const responded = rows.filter((r) => r.responded === "yes").length;
  const shown = onlyOpen ? rows.filter((r) => r.responded !== "yes") : rows;
  const cell = "input py-1 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">
          {invited} uitgenodigd{invitedKids > 0 ? ` (waarvan ${invitedKids} ${invitedKids === 1 ? "kind" : "kinderen"})` : ""}, {cards} {cards === 1 ? "kaart" : "kaarten"} verstuurd, {responded} gereageerd
          <span className="ml-2 text-xs font-normal text-muted">({rows.length} {rows.length === 1 ? "huishouden" : "huishoudens"})</span>
        </p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-xs text-muted" aria-live="polite">{message}</span>
          <label className="flex items-center gap-2"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="accent-[#6B1E2E]" /> Nog niet gereageerd</label>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2.5">Namen</th><th className="px-3 py-2.5">Aantal</th><th className="px-3 py-2.5">Kinderen</th><th className="px-3 py-2.5">Gastengroep</th><th className="px-3 py-2.5">Adres</th>
              <th className="px-3 py-2.5">E-mail</th><th className="px-3 py-2.5">Kaart via</th><th className="px-3 py-2.5">Verstuurd</th><th className="px-3 py-2.5">Gereageerd</th><th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-3 py-2"><input defaultValue={r.names} onBlur={onBlur(r.id, "names")} aria-label="Namen" className={`${cell} min-w-44`} /></td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={Math.max(1, kids[r.id] ?? 0)}
                    max={50}
                    defaultValue={r.party_size}
                    onBlur={(e) => {
                      const n = Math.round(Number(e.target.value)) || 1;
                      if (String(n) === e.target.defaultValue) return;
                      if (n < (kids[r.id] ?? 0)) {
                        setMessage("Minder personen dan kinderen kan niet: kinderen tellen mee in het aantal personen.");
                        e.target.value = e.target.defaultValue;
                        return;
                      }
                      setSizes((s) => ({ ...s, [r.id]: n }));
                      onBlur(r.id, "party_size")(e);
                    }}
                    aria-label="Aantal personen"
                    className={`${cell} w-16`}
                  />
                  <span className="mt-1 block text-[11px] whitespace-nowrap text-muted">{partyLabel(sizes[r.id] ?? r.party_size, kids[r.id] ?? 0)}</span>
                </td>
                <td className="px-3 py-2">
                  <ChildrenCell
                    coupleId={coupleId}
                    row={r}
                    partySize={sizes[r.id] ?? r.party_size}
                    onSaved={(count, msg) => {
                      setKids((k) => ({ ...k, [r.id]: count }));
                      setMessage(msg);
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <select defaultValue={r.group_id ?? ""} onChange={(e) => save(r.id, "group_id", e.target.value)} aria-label="Gastengroep" className={cell}>
                    <option value="">–</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><input defaultValue={r.address} onBlur={onBlur(r.id, "address")} aria-label="Adres" className={`${cell} min-w-52`} /></td>
                <td className="px-3 py-2"><input type="email" defaultValue={r.email} onBlur={onBlur(r.id, "email")} aria-label="E-mail" className={`${cell} min-w-44`} /></td>
                <td className="px-3 py-2">
                  <select defaultValue={r.send_via} onChange={(e) => save(r.id, "send_via", e.target.value)} aria-label="Kaart versturen via" className={cell}>
                    <option value="post">Post</option>
                    <option value="mail">Mail</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={sent[r.id]}
                    onChange={(e) => {
                      setSent((s) => ({ ...s, [r.id]: e.target.checked }));
                      save(r.id, "sent", e.target.checked);
                    }}
                    aria-label="Kaart verstuurd"
                    className="h-4 w-4 accent-[#6B1E2E]"
                  />
                </td>
                <td className="px-3 py-2">
                  {r.responded === "yes" && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">Ja</span>}
                  {r.responded === "no" && <span className="text-xs text-muted">Nog niet</span>}
                  {r.responded === "maybe" && (
                    <form action={confirmInvitationResponse} className="text-xs">
                      <input type="hidden" name="coupleId" value={coupleId} />
                      <input type="hidden" name="invitationId" value={r.id} />
                      <input type="hidden" name="responseId" value={r.match_id ?? ""} />
                      <span className="block text-gold-ink">Is dit {r.candidate}?</span>
                      <button type="submit" className="text-bordeaux underline">Ja, bevestigen</button>
                    </form>
                  )}
                </td>
                <td className="px-3 py-2">
                  <form action={deleteInvitation} onSubmit={(e) => { if (!confirm(`${r.names} verwijderen?`)) e.preventDefault(); }}>
                    <input type="hidden" name="coupleId" value={coupleId} />
                    <input type="hidden" name="invitationId" value={r.id} />
                    <button type="submit" className="text-xs text-muted hover:text-bordeaux" aria-label={`${r.names} verwijderen`}>×</button>
                  </form>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-muted">{rows.length ? "Iedereen heeft gereageerd." : "Nog niemand op de lijst. Voeg hieronder iemand toe of importeer een Excel-bestand."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
