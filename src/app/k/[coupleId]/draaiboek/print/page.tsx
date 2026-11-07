import Link from "next/link";
import { AutoPrint } from "@/components/AutoPrint";
import { PrintButton } from "@/components/PrintButton";
import { requirePlanning } from "@/lib/ws/access";
import { dayGuests } from "@/lib/ws/dayguests";
import { query } from "@/lib/ws/db";
import { coupleName, formatDate } from "@/lib/ws/format";
import { peopleFor, rowsFor, supplierContacts, tabsFor, type RunsheetTab } from "@/lib/ws/runsheet";
import { getSettings } from "@/lib/ws/settings";
import { SUPPLIER_STATUS } from "@/lib/ws/suppliers";
import { SeatingPrint } from "../SeatingTab";
import { StylingPrint } from "../StylingTab";

export const metadata = { title: "Draaiboek (print)" };

const Box = ({ on = false }: { on?: boolean }) => (
  <span className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink text-center text-[10px] leading-3">{on ? "✓" : ""}</span>
);
const th = "border-b border-ink py-1 pr-2 text-left font-semibold";
const td = "py-1 pr-2 align-top whitespace-pre-line";

/** "Draaiboek printen": the chosen tabs in their fixed order, each on a new page. */
export default async function RunSheetPrint({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  const sp = await searchParams;
  const tabs = await tabsFor(couple.id);
  const rawTabs = typeof sp.tabs === "string" ? sp.tabs.split(",") : ["cover", "toc", ...tabs.map((t) => t.id), "leveranciers"];
  // "seating:<plan id>": only that seating plan (the PDF button on the plan itself).
  const onlyPlan = rawTabs.find((t) => t.startsWith("seating:"))?.split(":")[1];
  const wanted = onlyPlan ? tabs.filter((t) => t.kind === "seating").map((t) => t.id) : rawTabs;
  const chosen = [...tabs.filter((t) => wanted.includes(t.id)), ...(wanted.includes("leveranciers") ? [{ id: "leveranciers", title: "Leveranciers", kind: "suppliers", position: 999 }] : [])] as (RunsheetTab | { id: string; title: string; kind: "suppliers"; position: number })[];
  const [settings, people] = await Promise.all([getSettings(), peopleFor(couple.id)]);
  const colorOf = (name: string) => people.find((p) => p.name.toLowerCase() === name.toLowerCase())?.color ?? "#ecebe8";

  return (
    <div className="print-sheet space-y-6 bg-white p-4 text-[12px] leading-snug print:p-0">
      {sp.print === "1" && <AutoPrint />}
      <div className="no-print flex gap-2">
        <Link href={`/k/${couple.id}/draaiboek`} className="btn-secondary">← Terug</Link>
        <PrintButton label="Printen of opslaan als pdf" />
      </div>

      {wanted.includes("cover") && (
        <section className="print-page flex min-h-[85vh] flex-col items-center justify-center text-center">
          <p className="eyebrow">Draaiboek</p>
          <h1 className="mt-3 text-4xl">{coupleName(couple)}</h1>
          <p className="mt-2 text-base">{formatDate(couple.wedding_date)}</p>
          {couple.location && <p className="text-base text-muted">{couple.location}</p>}
          <div className="mt-16 text-sm">
            <p className="font-serif text-base">{settings.contact_name}</p>
            <p>{settings.business_name}</p>
            <p>{settings.contact_phone} · {settings.contact_email}</p>
          </div>
        </section>
      )}

      {wanted.includes("toc") && chosen.length > 0 && (
        <section className="print-page">
          <h2 className="mb-3 text-2xl">Inhoud</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{chosen.map((t) => <li key={t.id}>{t.title}</li>)}</ol>
        </section>
      )}

      {await Promise.all(
        chosen.map(async (tab) => (
          <section key={tab.id} className="print-page">
            <h2 className="mb-2 text-xl">{tab.title}</h2>
            {tab.kind === "schedule" || tab.kind === "list" ? (
              <RowsPrint coupleId={couple.id} tab={tab} colorOf={colorOf} />
            ) : tab.kind === "packing" ? (
              <PackingPrint coupleId={couple.id} />
            ) : tab.kind === "photos" ? (
              <PhotosPrint coupleId={couple.id} />
            ) : tab.kind === "guests" ? (
              <GuestsPrint coupleId={couple.id} />
            ) : tab.kind === "styling" ? (
              <StylingPrint coupleId={couple.id} />
            ) : tab.kind === "seating" ? (
              <SeatingPrint coupleId={couple.id} layoutId={onlyPlan} />
            ) : (
              <SuppliersPrint coupleId={couple.id} />
            )}
          </section>
        )),
      )}
    </div>
  );
}

async function RowsPrint({ coupleId, tab, colorOf }: { coupleId: string; tab: RunsheetTab; colorOf: (n: string) => string }) {
  const rows = await rowsFor(coupleId, tab.id);
  const schedule = tab.kind === "schedule";
  const who = (people: string[], fallback: string) =>
    (people?.length ? people : fallback ? [fallback] : []).map((n) => (
      <span key={n} className="mr-1 inline-block rounded px-1" style={{ background: colorOf(n) }}>{n}</span>
    ));
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>{(schedule ? ["Tijd", "Wie", "Wat", "Meer info", "Waar", "Waar (regen)"] : ["Wat", "Wie", "Meer info"]).map((h) => <th key={h} className={th}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line" style={{ boxShadow: `inset 3px 0 0 ${colorOf(r.people?.[0] ?? "")}` }}>
            {schedule ? (
              <>
                <td className={`${td} pl-2 whitespace-nowrap`}>{r.at_time}</td><td className={td}>{who(r.people, r.who)}</td><td className={td}>{r.what}</td>
                <td className={td}>{r.info}</td><td className={td}>{r.location}</td><td className={td}>{r.rain_location}</td>
              </>
            ) : (
              <><td className={`${td} pl-2`}>{r.what}</td><td className={td}>{who(r.people, r.who)}</td><td className={td}>{r.info}</td></>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function PackingPrint({ coupleId }: { coupleId: string }) {
  const items = await query<{ list_kind: string; what: string; who: string; packed: boolean }>(
    "select list_kind, what, who, packed from packing_items where couple_id = $1 order by position, created_at",
    [coupleId],
  );
  const lists = [["wedding", "Inpaklijst bruiloft"], ["bag", "What's in my bag"], ["styling", "Styling meenemen"]];
  return (
    <div className="space-y-4">
      {lists.map(([kind, title]) => (
        <div key={kind}>
          <h3 className="mb-1 text-sm font-semibold">{title}</h3>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Wat moet er mee</th><th className={th}>Wie neemt het mee</th><th className={th}>Ingepakt</th></tr></thead>
            <tbody>
              {items.filter((i) => i.list_kind === kind).map((i, n) => (
                <tr key={n} className="border-b border-line"><td className={td}>{i.what}</td><td className={td}>{i.who}</td><td className={td}><Box on={i.packed} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

async function PhotosPrint({ coupleId }: { coupleId: string }) {
  const photos = await query<{ who: string; location: string; done: boolean }>("select who, location, done from group_photos where couple_id = $1 order by position, created_at", [coupleId]);
  return (
    <table className="w-full border-collapse">
      <thead><tr><th className={th}>Nr.</th><th className={th}>Wie staan erop</th><th className={th}>Locatie</th><th className={th}>Gemaakt</th></tr></thead>
      <tbody>
        {photos.map((p, i) => (
          <tr key={i} className="border-b border-line"><td className={td}>{i + 1}</td><td className={td}>{p.who}</td><td className={td}>{p.location}</td><td className={td}><Box on={p.done} /></td></tr>
        ))}
      </tbody>
    </table>
  );
}

async function GuestsPrint({ coupleId }: { coupleId: string }) {
  const { groups, guests } = await dayGuests(coupleId);
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const rows = guests.filter((g) => g.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="mb-1 text-sm font-semibold">{group} ({rows.length} aanwezig, waarvan {rows.filter((g) => g.is_kid).length} kinderen)</h3>
            <table className="w-full border-collapse">
              <thead><tr>{["Nr.", "Aanwezig", "Naam", "Relatie", "Mobiel", "Allergieën / dieet", "Deel van de dag"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((g, i) => (
                  <tr key={g.id} className={`border-b border-line ${g.important ? "font-semibold" : ""}`}>
                    <td className={td}>{i + 1}</td><td className={td}><Box /></td>
                    <td className={td}>{g.important ? "★ " : ""}{g.first_name} {g.last_name}{g.is_kid ? " (kind)" : ""}</td>
                    <td className={td}>{g.relation_note || g.relation}</td><td className={td}>{g.phone}</td><td className={td}>{g.diet}</td>
                    <td className={td}>{g.attendance === "partial" ? g.partial_note || "Ja" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

async function SuppliersPrint({ coupleId }: { coupleId: string }) {
  const suppliers = await supplierContacts(coupleId);
  return (
    <table className="w-full border-collapse">
      <thead><tr>{["Categorie", "Leverancier", "Contact", "Telefoon", "E-mail"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>
        {suppliers.map((s) => (
          <tr key={s.id} className="border-b border-line">
            <td className={td}>{s.category_name}<span className="block text-[10px] text-muted">{SUPPLIER_STATUS[s.status]}</span></td>
            <td className={td}>{s.name}</td><td className={td}>{s.contact_person}</td><td className={td}>{s.phone}</td><td className={td}>{s.email}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
