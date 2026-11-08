import { VideoEmbed } from "@/components/VideoEmbed";

/**
 * A video Sabine set for every couple (the opening dance, the tour): an
 * upload goes before a YouTube/Vimeo link. Never plays by itself.
 */
export function SettingVideo({
  fileId,
  url,
  title,
  className = "aspect-video w-full rounded-xl bg-ink",
  playsInline = true,
}: {
  fileId: string | null;
  url: string;
  title: string;
  className?: string;
  playsInline?: boolean;
}) {
  if (fileId) return <video controls preload="metadata" playsInline={playsInline} src={`/api/ws-bestanden/${fileId}`} className={className} />;
  if (url) return <VideoEmbed url={url} title={title} />;
  return null;
}

export const hasSettingVideo = (fileId: string | null, url: string) => Boolean(fileId || url);
