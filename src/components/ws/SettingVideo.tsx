import { VideoEmbed } from "@/components/VideoEmbed";

/**
 * A video Sabine set for every couple (the opening dance, the tour): a
 * YouTube/Vimeo link, or a video uploaded before uploads stopped. Never plays by itself.
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
  if (url) return <VideoEmbed url={url} title={title} />;
  if (fileId) return <video controls preload="metadata" playsInline={playsInline} src={`/api/ws-bestanden/${fileId}`} className={className} />;
  return null;
}

export const hasSettingVideo = (fileId: string | null, url: string) => Boolean(fileId || url);
