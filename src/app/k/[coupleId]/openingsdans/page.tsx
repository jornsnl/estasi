import { saveDance } from "@/app/actions/ws-dance";
import { MAX_DANCE_VIDEOS } from "@/lib/ws/dance";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { FileUpload } from "@/components/ws/FileUpload";
import { RepeatRows } from "@/components/ws/RepeatRows";
import { DanceInfo } from "@/components/ws/DanceInfo";
import { requireCouple } from "@/lib/ws/access";
import { couplePackages } from "@/lib/ws/couples";
import { one, query } from "@/lib/ws/db";
import { directUploads } from "@/lib/ws/files";
import type { Couple } from "@/lib/ws/types";

export const metadata = { title: "De openingsdans" };

interface Wishes {
  description: string;
  lifts: boolean;
  dips: boolean;
  spins: boolean;
  special: boolean;
  special_text: string;
  experience: string;
  songs: { title: string; artist: string; link: string; note: string }[];
  song_mode: "first" | "mix";
  audio_file_id: string | null;
  videos: { url: string; note: string }[];
  clothing: string;
  sabine_notes: string;
  sabine_videos: { url: string; note: string }[];
}

const EMPTY: Wishes = {
  description: "", lifts: false, dips: false, spins: false, special: false, special_text: "", experience: "", songs: [], song_mode: "first",
  audio_file_id: null, videos: [], clothing: "", sabine_notes: "", sabine_videos: [],
};

export default async function DancePage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const ctx = await requireCouple(coupleId);
  // Feedback 9.1: with the dance in the package the page with the assignments; without it the
  // information page, also for Sabine looking along (she can still open the assignments).
  const inPackage = ctx.kinds.includes("od");
  if (!inPackage && !(ctx.isAdmin && (await searchParams).weergave === "opdrachten")) {
    return <DanceInfo couple={ctx.couple} isAdmin={ctx.isAdmin} searchParams={searchParams} />;
  }
  return <DanceWishes couple={ctx.couple} isAdmin={ctx.isAdmin} searchParams={searchParams} />;
}

async function DanceWishes({
  couple,
  isAdmin,
  searchParams,
}: {
  couple: Couple;
  isAdmin: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [w, packages, audio] = await Promise.all([
    one<Wishes>("select * from dance_wishes where couple_id = $1", [couple.id]).then((r) => r ?? EMPTY),
    couplePackages(couple.id),
    query<{ name: string }>("select f.name from dance_wishes d join files f on f.id = d.audio_file_id where d.couple_id = $1", [couple.id]),
  ]);
  const dance = packages.filter((p) => p.kind === "od");
  const hidden = (block: string) => (
    <>
      <input type="hidden" name="coupleId" value={couple.id} />
      <input type="hidden" name="block" value={block} />
    </>
  );
  const box = "flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">De openingsdans</h1>
        {dance.length > 0 && <p className="mt-1 text-gold-ink">{dance.map((p) => p.name.replace(/^Openingsdans:\s*/, "")).join(", ")}{dance[0].variant ? ` · ${dance[0].variant}` : ""}</p>}
        <p className="mt-2 text-sm text-muted">Vertel ons hier alles over jullie droomdans. Hoe meer we weten, hoe beter we de dans op jullie kunnen afstemmen.</p>
      </header>
      <Notice searchParams={searchParams} />

      <form id="blok-1" action={saveDance} className="card scroll-mt-6 space-y-4 p-5">
        {hidden("1")}
        <h2 className="text-xl">1. Jullie dans</h2>
        <div><label className="label" htmlFor="description">Omschrijving: hoe zien jullie de dans voor je?</label><AutoTextarea id="description" name="description" defaultValue={w.description} className="input min-h-24" /></div>
        <fieldset>
          <legend className="label">Wat willen jullie erin?</legend>
          <div className="flex flex-wrap gap-2">
            <label className={box}><input type="checkbox" name="lifts" defaultChecked={w.lifts} className="accent-[#6B1E2E]" /> Lifts</label>
            <label className={box}><input type="checkbox" name="dips" defaultChecked={w.dips} className="accent-[#6B1E2E]" /> Dips</label>
            <label className={box}><input type="checkbox" name="spins" defaultChecked={w.spins} className="accent-[#6B1E2E]" /> Draaien</label>
            <label className={box}><input type="checkbox" name="special" defaultChecked={w.special} className="accent-[#6B1E2E]" /> Speciale move</label>
          </div>
          <input name="specialText" defaultValue={w.special_text} placeholder="Welke speciale move?" aria-label="Welke speciale move" className="input mt-2" />
        </fieldset>
        <fieldset>
          <legend className="label">Danservaring</legend>
          <div className="flex flex-wrap gap-2">
            {[["none", "Geen"], ["some", "Een beetje"], ["lots", "Veel"]].map(([v, l]) => (
              <label key={v} className={box}><input type="radio" name="experience" value={v} defaultChecked={w.experience === v} className="accent-[#6B1E2E]" /> {l}</label>
            ))}
          </div>
        </fieldset>
        <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
      </form>

      <form id="blok-2" action={saveDance} className="card scroll-mt-6 space-y-4 p-5">
        {hidden("2")}
        <h2 className="text-xl">2. Muziek</h2>
        <RepeatRows
          addLabel="Nummer toevoegen"
          initial={w.songs.map((s) => ({ songTitle: s.title, songArtist: s.artist, songLink: s.link, songNote: s.note }))}
          fields={[
            { name: "songTitle", label: "Titel" },
            { name: "songArtist", label: "Artiest" },
            { name: "songLink", label: "Link (Spotify of YouTube)", wide: true },
            { name: "songNote", label: "Opmerking", wide: true },
          ]}
        />
        <fieldset className="flex flex-wrap gap-2">
          <legend className="label">Bij meerdere nummers</legend>
          <label className={box}><input type="radio" name="songMode" value="first" defaultChecked={w.song_mode === "first"} className="accent-[#6B1E2E]" /> Het eerste is onze eerste keus</label>
          <label className={box}><input type="radio" name="songMode" value="mix" defaultChecked={w.song_mode === "mix"} className="accent-[#6B1E2E]" /> We willen een mix</label>
        </fieldset>
        <div className="space-y-2">
          <p className="label">Eigen audiobestand (mp3, m4a of wav)</p>
          {w.audio_file_id && (
            <div className="space-y-1">
              <audio controls src={`/api/ws-bestanden/${w.audio_file_id}`} className="w-full" />
              <p className="text-xs text-muted">{audio[0]?.name}</p>
              <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeAudio" /> Audiobestand verwijderen</label>
            </div>
          )}
          <FileUpload name="audio" coupleId={couple.id} kind="audio" direct={directUploads()} label={w.audio_file_id ? "Ander audiobestand" : "Audiobestand uploaden"} />
        </div>
        <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
      </form>

      <form id="blok-3" action={saveDance} className="card scroll-mt-6 space-y-4 p-5">
        {hidden("3")}
        <h2 className="text-xl">3. Inspiratie en praktisch</h2>
        <div>
          <p className="label">Video&apos;s die jullie mooi vinden (maximaal {MAX_DANCE_VIDEOS})</p>
          <RepeatRows max={MAX_DANCE_VIDEOS} addLabel="Video toevoegen" initial={w.videos.map((v) => ({ videoUrl: v.url, videoNote: v.note }))} fields={[{ name: "videoUrl", label: "Link naar de video" }, { name: "videoNote", label: "Wat vinden jullie er mooi aan?" }]} />
        </div>
        <div><label className="label" htmlFor="clothing">Kleding (bijvoorbeeld lange jurk, hakken)</label><AutoTextarea id="clothing" name="clothing" defaultValue={w.clothing} className="input" /></div>
        <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
      </form>

      <section id="blok-4" className="card scroll-mt-6 space-y-4 border border-gold/40 p-5">
        <h2 className="text-xl">4. Notities van Sabine</h2>
        {isAdmin ? (
          <form action={saveDance} className="space-y-3">
            {hidden("4")}
            <div><label className="label" htmlFor="notes">Opbouw van de dans, oefentips</label><AutoTextarea id="notes" name="notes" defaultValue={w.sabine_notes} className="input min-h-32" /></div>
            <div>
              <p className="label">Oefenvideo&apos;s (maximaal {MAX_DANCE_VIDEOS})</p>
              <RepeatRows max={MAX_DANCE_VIDEOS} addLabel="Oefenvideo toevoegen" initial={w.sabine_videos.map((v) => ({ videoUrl: v.url, videoNote: v.note }))} fields={[{ name: "videoUrl", label: "Link naar de video" }, { name: "videoNote", label: "Toelichting" }]} />
            </div>
            <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
          </form>
        ) : (
          <>
            {w.sabine_notes ? <p className="text-sm whitespace-pre-line">{w.sabine_notes}</p> : <p className="text-sm text-muted">Na jullie eerste les zet Sabine hier de opbouw van de dans en oefentips neer.</p>}
            {w.sabine_videos.map((v) => (
              <div key={v.url} className="space-y-1">
                <VideoEmbed url={v.url} title={v.note || "Oefenvideo"} />
                <a href={v.url} target="_blank" rel="noreferrer" className="text-xs text-bordeaux underline">{v.note || v.url}</a>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
