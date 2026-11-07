import Link from "next/link";
import { StylingPlaces } from "@/components/ws/StylingPlaces";
import { directUploads } from "@/lib/ws/files";
import { peopleFor } from "@/lib/ws/runsheet";
import { stylingPlaces } from "@/lib/ws/styling";

/** The styling plan in the run sheet: the same as on Stylingplan & Moodboard, here to view and tick "Klaargezet". */
export async function StylingTab({ coupleId, isAdmin }: { coupleId: string; isAdmin: boolean }) {
  const [places, people] = await Promise.all([stylingPlaces(coupleId, isAdmin), peopleFor(coupleId)]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Precies wat er bij Stylingplan & Moodboard staat. {isAdmin ? "Vink op de dag aan wat klaarstaat." : "Sabine vinkt op de dag aan wat klaarstaat."}</p>
        <Link href={`/k/${coupleId}/styling#plan`} className="btn-secondary py-1.5">Bewerken in Stylingplan</Link>
      </div>
      <StylingPlaces coupleId={coupleId} places={places} names={people.map((p) => p.name)} isAdmin={isAdmin} mode="day" direct={directUploads()} />
    </div>
  );
}

export async function StylingPrint({ coupleId }: { coupleId: string }) {
  const places = await stylingPlaces(coupleId, false);
  const th = "border-b border-ink py-1 pr-2 text-left font-semibold";
  return (
    <div className="space-y-4">
      {places.map((p) => (
        <div key={p.id} className="break-inside-avoid">
          <h3 className="mb-1 text-sm font-semibold">{p.name}</h3>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Wat</th><th className={th}>Wie regelt het</th><th className={th}>Klaargezet</th></tr></thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.id} className="border-b border-line">
                  <td className="py-1 pr-2">{i.what}</td><td className="py-1 pr-2">{i.who}</td>
                  <td className="py-1 pr-2"><span className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink text-center text-[10px] leading-3">{i.ready ? "✓" : ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded images behind a login check */}
              {p.images.map((img) => <img key={img.id} src={`/api/ws-bestanden/${img.file_id}`} alt="" className="max-h-56 max-w-[48%] rounded object-contain" />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
