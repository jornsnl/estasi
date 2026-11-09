import { saveTourTexts, saveTourVideo } from "@/app/actions/ws-tour";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { hasSettingVideo } from "@/components/ws/SettingVideo";
import { TourButton } from "@/components/ws/TourButton";
import { VideoSettingForm } from "@/components/ws/VideoSettingForm";
import { requireOwner } from "@/lib/auth/session";
import { getSettings } from "@/lib/ws/settings";

export const metadata = { title: "Rondleiding" };

/**
 * Systeem > Rondleiding (feedback): everything of the tour of Your Wedding
 * Space in one place. The video, the welcome block couples see on their first
 * visit, and the pop-up behind "Bekijk de rondleiding". Without a video there
 * is no button and no welcome block.
 */
export default async function TourSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const s = await getSettings();
  const hasVideo = hasSettingVideo(s.tour_video_file_id, s.tour_video_url);
  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">Systeem</p>
        <h1 className="mt-1 text-4xl">Rondleiding</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Op de startpagina van elk bruidspaar staat de knop &quot;Bekijk de rondleiding&quot;; de video opent in een pop-up. Bij het eerste bezoek staat er ook
          een welkomstblok, tot het bruidspaar het wegklikt. Zonder video staan er geen knop en geen welkomstblok.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <section id="video" className="scroll-mt-6 space-y-2">
        <h2 className="section-title">1. Video</h2>
        <VideoSettingForm
          action={saveTourVideo}
          fileId={s.tour_video_file_id}
          url={s.tour_video_url}
          title="Rondleiding door Your Wedding Space"
          emptyText="Nog geen rondleidingsvideo ingesteld. Zolang er geen video is, zien bruidsparen geen knop."
          fieldId="tourVideoUrl"
        />
      </section>

      <form id="teksten" action={saveTourTexts} className="card scroll-mt-6 space-y-6 p-5">
        <div className="space-y-3">
          <h2 className="section-title">2. Welkomstblok bij de eerste login</h2>
          <div>
            <label className="label" htmlFor="welcomeTitle">Titel</label>
            <input id="welcomeTitle" name="welcomeTitle" defaultValue={s.tour_welcome_title} maxLength={200} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="welcomeText">Welkomsttekst</label>
            <textarea id="welcomeText" name="welcomeText" defaultValue={s.tour_welcome_text} rows={3} maxLength={2000} className="input" />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="section-title">3. Pop-up met de video</h2>
          <div>
            <label className="label" htmlFor="popupTitle">Titel</label>
            <input id="popupTitle" name="popupTitle" defaultValue={s.tour_popup_title} maxLength={200} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="popupText">Tekst boven de video</label>
            <textarea id="popupText" name="popupText" defaultValue={s.tour_popup_text} rows={2} maxLength={2000} className="input" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton className="btn-primary" pendingText="Opslaan…">Teksten opslaan</SubmitButton>
          {hasVideo && <TourButton fileId={s.tour_video_file_id} url={s.tour_video_url} className="btn-secondary" title={s.tour_popup_title} text={s.tour_popup_text} />}
        </div>
        {hasVideo && <p className="text-xs text-muted">Met de tweede knop zie je de pop-up zoals bruidsparen hem zien (na opslaan).</p>}
      </form>
    </div>
  );
}
