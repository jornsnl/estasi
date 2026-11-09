import Link from "next/link";
import { Feed } from "@/components/community/Feed";
import { Notice } from "@/components/Notice";
import { canReadConversation, canUseCommunity } from "@/lib/community/rules";
import { listPosts, markCommunitySeen, member, requireViewer } from "@/lib/community/server";

export const metadata = { title: "Community" };

type Search = Record<string, string | string[] | undefined>;

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireViewer();
  if (!canUseCommunity(viewer)) {
    return (
      <div className="max-w-3xl">
        <p className="eyebrow">Community</p>
        <h1 className="mt-1 mb-6 text-4xl">Community</h1>
        <div className="card border-bordeaux/20 bg-bordeaux-soft/60 p-6">
          <h2 className="text-2xl text-bordeaux">De community is alleen voor cursisten met actieve toegang</h2>
          <p className="mt-2">Zodra je toegang weer actief is, kun je weer meelezen en berichten plaatsen.</p>
          {canReadConversation(viewer, viewer.id) && (
            <p className="mt-3 text-sm">
              Je privéberichten met Sabine blijven wel bereikbaar:{" "}
              <Link href="/prive-chat" className="text-bordeaux underline">
                naar je privéchat
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    );
  }
  const params = await searchParams;
  const page = Math.max(1, Math.min(500, Number(params.pagina) || 1));
  const [{ posts, hasMore }, seen] = await Promise.all([listPosts(viewer, page), member(viewer.id)]);
  if (page === 1) await markCommunitySeen(viewer.id);

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Community</p>
      <h1 className="mt-1 mb-2 text-4xl">Samen leren</h1>
      <p className="mb-6 text-muted">
        De plek voor alle cursisten van de Future Weddings Academy en Sabine. Deel vragen, ervaringen en inspiratie. Alleen cursisten met toegang en
        Sabine zien wat hier staat.
      </p>
      <Notice searchParams={searchParams} />
      <Feed viewer={viewer} posts={posts} page={page} hasMore={hasMore} basePath="/community" seenBefore={seen.communitySeenAt} />
    </div>
  );
}
