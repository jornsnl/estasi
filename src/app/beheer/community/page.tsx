import { Feed } from "@/components/community/Feed";
import { Notice } from "@/components/Notice";
import { requireOwner } from "@/lib/auth/session";
import { listPosts, markCommunitySeen, member, openReports, viewerFor } from "@/lib/community/server";

export const metadata = { title: "Community" };

type Search = Record<string, string | string[] | undefined>;

export default async function OwnerCommunityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await viewerFor(await requireOwner());
  const params = await searchParams;
  const page = Math.max(1, Math.min(500, Number(params.pagina) || 1));
  const [{ posts, hasMore }, seen, reports] = await Promise.all([listPosts(viewer, page), member(viewer.id), openReports(viewer)]);
  if (page === 1) await markCommunitySeen(viewer.id);

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Academy</p>
      <h1 className="mt-1 mb-2 text-4xl">Community</h1>
      <p className="mb-6 text-sm text-muted">
        Alle cursisten met actieve toegang zien deze berichten. Jij kunt berichten vastpinnen, verbergen (alleen jij en de schrijver zien ze dan nog) of
        verwijderen. Cursisten met verlopen, gepauzeerde of ingetrokken toegang zien de community niet.
      </p>
      <Notice searchParams={searchParams} />
      <Feed
        viewer={viewer}
        posts={posts}
        page={page}
        hasMore={hasMore}
        basePath="/beheer/community"
        seenBefore={seen.communitySeenAt}
        reports={page === 1 ? reports : []}
      />
    </div>
  );
}
