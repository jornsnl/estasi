import Link from "next/link";
import { AutoPrint } from "@/components/AutoPrint";
import { PrintButton } from "@/components/PrintButton";
import { SpeechPrintTable } from "@/components/ws/SpeechPrint";
import { query } from "@/lib/ws/db";
import { printGuests, printSpeeches, printSuppliers, type PrintCouple } from "@/lib/ws/draaiboek-print";
import { guestHeadings, supplierHeadings, viewerFields, type DraaiboekViewer, type ViewerFields } from "@/lib/ws/draaiboek-viewer";
import { coupleName, formatDate } from "@/lib/ws/format";
import { coverCounts, notResponded, type GroupKind } from "@/lib/ws/guest-counts";
import { invitationsFor } from "@/lib/ws/invitations";
import { mealsFor } from "@/lib/ws/meals";
import { peopleFor, rowsFor, tabsFor, type RunsheetTab } from "@/lib/ws/runsheet";
import { withVirtualTabs } from "@/lib/ws/runsheet-pure";
import { getSettings } from "@/lib/ws/settings";
import { SUPPLIER_STATUS } from "@/lib/ws/suppliers";
import { SeatingPrint } from "../SeatingTab";
import { StylingPrint } from "../StylingTab";

const Box = ({ on = false }: { on?: boolean }) => (
  <span className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink text-center text-[10px] leading-3">{on ? "✓" : ""}</span>
);
const th = "border-b border-ink py-1 pr-2 text-left font-semibold";
const td = "py-1 pr-2 align-top whitespace-pre-line";

type Chapter = RunsheetTab | { id: string; title: string; kind: "suppliers" | "meals" | "speeches"; position: number };

/**
 * "Draaiboek printen": the chosen tabs in their fixed order, each on a new
 * page. The viewer decides which fields are fetched (feedback 13.5): Sabine,
 * the couple, or a student who walks along (read only, no contact details of
 * guests or suppliers, no speeches, no print button, no links into the portal).
 * The caller has checked that this viewer may see this couple.
 */
export async function DraaiboekPrintView({
  couple,
  viewer,
  searchParams: sp,
  fileBase,
}: {
  couple: PrintCouple;
  viewer: DraaiboekViewer;
  searchParams: Record<string, string | string[] | undefined>;
  /** Where images are served; the student's view has its own checked route. */
  fileBase?: string;
}) {
  const fields = viewerFields(viewer);
  const tabs = await tabsFor(couple.id);
  // Same order as on screen, with Leveranciers and Eten & allergieën in between.
  const shown = withVirtualTabs(tabs);
  const rawTabs = fields.chooseTabs && typeof sp.tabs === "string" ? sp.tabs.split(",") : ["cover", "toc", ...shown.map((t) => t.id)];
  // "seating:<plan id>": only that seating plan (the PDF button on the plan itself).
  const onlyPlan = rawTabs.find((t) => t.startsWith("seating:"))?.split(":")[1];
  const wanted = onlyPlan ? tabs.filter((t) => t.kind === "seating").map((t) => t.id) : rawTabs;
  const chosen = shown.filter((t) => wanted.includes(t.id)) as Chapter[];
  // Speeches (feedback 12.3): only for Sabine, whatever the link says; a chapter right after the day schedule.
  const speeches = sp.speeches === "1" && !onlyPlan ? await printSpeeches(couple.id, fields) : null;
  if (speeches) {
    const at = chosen.findIndex((t) => t.kind === "schedule");
    chosen.splice(at === -1 ? chosen.length : at + 1, 0, { id: "speeches", title: "Speeches", kind: "speeches", position: 0 });
  }
  const [settings, people] = await Promise.all([getSettings(), peopleFor(couple.id)]);
  const colorOf = (name: string) => people.find((p) => p.name.toLowerCase() === name.toLowerCase())?.color ?? "#ecebe8";

  return (
    <div className={`print-sheet space-y-6 bg-white p-4 text-[12px] leading-snug print:p-0 ${fields.print ? "" : "print:hidden"}`}>
      {fields.print && sp.print === "1" && <AutoPrint />}
      {fields.print && fields.portalLinks && (
        <div className="no-print flex gap-2">
          <Link href={`/k/${couple.id}/draaiboek`} className="btn-secondary">← Terug</Link>
          <PrintButton label="Printen of opslaan als pdf" />
        </div>
      )}

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
          <CoverGuests coupleId={couple.id} printed={fields.print} />
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
              <GuestsPrint coupleId={couple.id} fields={fields} />
            ) : tab.kind === "styling" ? (
              <StylingPrint coupleId={couple.id} fileBase={fileBase} />
            ) : tab.kind === "seating" ? (
              <>
                <SeatingPrint coupleId={couple.id} layoutId={onlyPlan} />
                {!onlyPlan && <SeatingNotesPrint coupleId={couple.id} tab={tab as RunsheetTab} colorOf={colorOf} />}
              </>
            ) : tab.kind === "meals" ? (
              <MealsPrint coupleId={couple.id} />
            ) : tab.kind === "speeches" ? (
              <SpeechPrintTable speeches={speeches ?? []} />
            ) : (
              <SuppliersPrint coupleId={couple.id} fields={fields} />
            )}
          </section>
        )),
      )}
    </div>
  );
}

/** The guest overview on the cover: signed-up guests only, each counted once. */
async function CoverGuests({ coupleId, printed }: { coupleId: string; printed: boolean }) {
  const [guests, invitations] = await Promise.all([
    query<{ attendance: string; is_kid: boolean; group_kind: GroupKind | null }>(
      "select g.attendance, g.is_kid, gg.kind as group_kind from guests g left join guest_groups gg on gg.id = g.group_id where g.couple_id = $1",
      [coupleId],
    ),
    invitationsFor(coupleId),
  ]);
  const c = coverCounts(guests);
  // Only the counts leave this function, never the invitations themselves.
  const open = notResponded(invitations);
  const cell = "px-3 py-0.5 text-right tabular-nums";
  return (
    <div className="mt-10 break-inside-avoid text-sm">
      <h2 className="mb-1 font-serif text-base">Gastenoverzicht</h2>
      <table className="mx-auto border-collapse">
        <thead>
          <tr className="text-xs text-muted"><th /><th className={cell}>Volwassenen</th><th className={cell}>Kinderen</th><th className={cell}>Totaal</th></tr>
        </thead>
        <tbody>
          <tr><th className="pr-3 text-left font-normal">Daggasten</th><td className={cell}>{c.day.adults}</td><td className={cell}>{c.day.kids}</td><td className={cell}>{c.day.adults + c.day.kids}</td></tr>
          <tr><th className="pr-3 text-left font-normal">Avondgasten</th><td className={cell}>{c.evening.adults}</td><td className={cell}>{c.evening.kids}</td><td className={cell}>{c.evening.adults + c.evening.kids}</td></tr>
          <tr className="border-t border-ink font-semibold"><th className="pr-3 text-left">Totaal</th><td className={cell}>{c.day.adults + c.evening.adults}</td><td className={cell}>{c.day.kids + c.evening.kids}</td><td className={cell}>{c.total}</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted">
        Nog geen reactie: {open.people}{open.households ? ` (${open.households} ${open.households === 1 ? "uitnodiging" : "uitnodigingen"})` : ""} · {printed ? "Geprint op" : "Bijgewerkt tot"} {formatDate(new Date())}
      </p>
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
          <table className="w-full table-fixed border-collapse break-words">
            <colgroup><col /><col className="w-[34%]" /><col className="w-20" /></colgroup>
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

/** The same column widths for every group, so the columns line up from block to block. */
const GUEST_COLS = ["w-[6%]", "w-[10%]", "w-[20%]", "w-[18%]", "w-[14%]", "w-[18%]", "w-[14%]"];
/** Without the phone column: its width goes to name and allergies. */
const GUEST_COLS_NO_CONTACT = ["w-[6%]", "w-[10%]", "w-[26%]", "w-[18%]", "w-[26%]", "w-[14%]"];

async function GuestsPrint({ coupleId, fields }: { coupleId: string; fields: ViewerFields }) {
  const { groups, guests } = await printGuests(coupleId, fields);
  const cols = fields.guestContact ? GUEST_COLS : GUEST_COLS_NO_CONTACT;
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const rows = guests.filter((g) => g.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="mb-1 text-sm font-semibold">{group} ({rows.length} aanwezig, waarvan {rows.filter((g) => g.is_kid).length} kinderen)</h3>
            <table className="w-full table-fixed border-collapse break-words">
              <colgroup>{cols.map((w, i) => <col key={i} className={w} />)}</colgroup>
              <thead><tr>{guestHeadings(fields).map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((g, i) => (
                  <tr key={g.id} className={`border-b border-line ${g.important ? "font-semibold" : ""}`}>
                    <td className={td}>{i + 1}</td><td className={td}><Box /></td>
                    <td className={td}>{g.important ? "★ " : ""}{g.first_name} {g.last_name}{g.is_kid ? " (kind)" : ""}</td>
                    <td className={td}>{g.relation_note || g.relation}</td>
                    {fields.guestContact && <td className={td}>{g.phone}</td>}
                    <td className={td}>{g.diet}</td>
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

/** Notes from the old "Opstelling" list, when there are any. */
async function SeatingNotesPrint({ coupleId, tab, colorOf }: { coupleId: string; tab: RunsheetTab; colorOf: (n: string) => string }) {
  const rows = await rowsFor(coupleId, tab.id);
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-1 text-base">Notities bij de opstelling</h3>
      <RowsPrint coupleId={coupleId} tab={{ ...tab, kind: "list" }} colorOf={colorOf} />
    </div>
  );
}

async function MealsPrint({ coupleId }: { coupleId: string }) {
  const { moments, totals } = await mealsFor(coupleId);
  return (
    <table className="w-full border-collapse">
      <thead><tr>{["Eetmoment", "Tijd", "Cateraar", "Personen"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>
        {moments.filter((m) => m.active).map((m) => (
          <tr key={m.id} className="border-b border-line">
            <td className={td}>{m.name}</td><td className={td}>{m.at_time}</td><td className={td}>{m.caterer}</td><td className={td}>{totals[m.id] ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function SuppliersPrint({ coupleId, fields }: { coupleId: string; fields: ViewerFields }) {
  const suppliers = await printSuppliers(coupleId, fields);
  return (
    <table className="w-full border-collapse">
      <thead><tr>{supplierHeadings(fields).map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>
        {suppliers.map((s) => (
          <tr key={s.id} className="border-b border-line">
            <td className={td}>{s.category_name}<span className="block text-[10px] text-muted">{SUPPLIER_STATUS[s.status as keyof typeof SUPPLIER_STATUS]}</span></td>
            <td className={td}>{s.name}</td><td className={td}>{s.contact_person}</td>
            {fields.supplierContact && <><td className={td}>{s.phone}</td><td className={td}>{s.email}</td></>}
            <td className={td}>{[s.present_from, s.present_until].filter(Boolean).join(" – ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
