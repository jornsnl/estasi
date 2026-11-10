import Link from "next/link";
import {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  reportItem,
  resolveReport,
  setCommentHidden,
  setPostHidden,
  setPostPinned,
  updateComment,
  updatePost,
} from "@/app/actions/community";
import { Badge } from "@/components/Badge";
import { SubmitButton } from "@/components/SubmitButton";
import {
  canComment,
  canDeleteItem,
  canEditItem,
  canModerate,
  canReport,
  LIMITS,
  preview,
  type Viewer,
} from "@/lib/community/rules";
import type { CommentView, PostView, ReportView } from "@/lib/community/server";
import { formatDateTime } from "@/lib/util/format";
import { AttachmentPicker } from "./AttachmentPicker";
import { Attachments, Avatar, PlainText, VideoLink } from "./Content";

/** The community: new post, open reports (Sabine), the posts with their comments. */
export function Feed({
  viewer,
  posts,
  page,
  hasMore,
  basePath,
  seenBefore,
  reports = [],
}: {
  viewer: Viewer;
  posts: PostView[];
  page: number;
  hasMore: boolean;
  basePath: string;
  /** The previous visit: everything by others after it is marked as new. */
  seenBefore: string | null;
  reports?: ReportView[];
}) {
  return (
    <div className="space-y-6">
      {reports.length > 0 && (
        <section className="card border-bordeaux/30 p-5" aria-labelledby="meldingen-kop">
          <h2 id="meldingen-kop" className="text-xl text-bordeaux">
            Meldingen ({reports.length})
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {reports.map((report) => (
              <li key={report.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p>
                    <strong>{report.reporterName}</strong> meldde {report.commentId ? "een reactie" : "een bericht"} van <strong>{report.authorName}</strong>{" "}
                    <span className="text-muted">· {formatDateTime(report.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-muted">“{preview(report.excerpt, 160) || "zonder tekst"}”</p>
                  {report.reason && <p className="mt-1">Reden: {report.reason}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <a href={`#${report.commentId ? `reactie-${report.commentId}` : `bericht-${report.postId}`}`} className="btn-secondary py-1.5">
                    Bekijken
                  </a>
                  <form action={resolveReport}>
                    <input type="hidden" name="reportId" value={report.id} />
                    <SubmitButton className="btn-ghost py-1.5">Afgehandeld</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Verberg of verwijder het bericht als het niet in de community hoort; de melding is dan ook afgehandeld.</p>
        </section>
      )}

      {page === 1 && (
        <form action={createPost} className="card space-y-3 p-5">
          <label htmlFor="nieuw-bericht" className="label">
            Nieuw bericht
          </label>
          <textarea
            id="nieuw-bericht"
            name="body"
            rows={3}
            maxLength={LIMITS.post}
            placeholder="Deel een vraag, ervaring of inspiratie met de groep…"
            className="input"
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">Video van YouTube of Vimeo toevoegen</summary>
            <input name="videoUrl" type="text" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" className="input mt-2" />
          </details>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <AttachmentPicker />
            <SubmitButton pendingText="Plaatsen…">Plaatsen</SubmitButton>
          </div>
          <p className="hint">Foto&apos;s en bestanden tot 10 MB per stuk, maximaal 6 per bericht. Video&apos;s via een YouTube- of Vimeo-link.</p>
        </form>
      )}

      {posts.length === 0 && (
        <div className="card p-8 text-center text-muted">{page === 1 ? "Nog geen berichten. Plaats het eerste!" : "Geen oudere berichten."}</div>
      )}

      {posts.map((post) => (
        <Post key={post.id} viewer={viewer} post={post} seenBefore={seenBefore} />
      ))}

      {(page > 1 || hasMore) && (
        <nav className="flex justify-between" aria-label="Pagina's">
          {page > 1 ? (
            <Link href={page === 2 ? basePath : `${basePath}?pagina=${page - 1}`} className="btn-secondary">
              Nieuwere berichten
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`${basePath}?pagina=${page + 1}`} className="btn-secondary">
              Oudere berichten
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

const isNew = (item: { createdAt: string; authorId: string }, viewer: Viewer, seenBefore: string | null) =>
  item.authorId !== viewer.id && (!seenBefore || item.createdAt > seenBefore);

function Byline({ name, owner, at, edited }: { name: string; owner: boolean; at: string; edited: string | null }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-medium text-ink">{name}</span>
        {owner && <Badge tone="bordeaux">Opleider</Badge>}
      </p>
      <p className="text-xs text-muted">
        {formatDateTime(at)}
        {edited && " · bewerkt"}
      </p>
    </div>
  );
}

function Post({ viewer, post, seenBefore }: { viewer: Viewer; post: PostView; seenBefore: string | null }) {
  const moderator = canModerate(viewer);
  return (
    <article
      id={`bericht-${post.id}`}
      className={`card scroll-mt-20 p-5 ${post.hiddenAt ? "border-dashed opacity-80" : ""} ${post.pinnedAt ? "border-gold" : ""}`}
    >
      <header className="flex items-start gap-3">
        <Avatar name={post.author.name} owner={post.author.role === "owner"} userId={post.author.id} photoFileId={post.author.photoFileId} />
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
          <Byline name={post.author.name} owner={post.author.role === "owner"} at={post.createdAt} edited={post.editedAt} />
          <div className="flex flex-wrap gap-1.5">
            {post.pinnedAt && <Badge tone="gold">Vastgepind</Badge>}
            {post.hiddenAt && <Badge tone="bordeaux">{moderator ? "Verborgen voor cursisten" : "Verborgen door Sabine"}</Badge>}
            {isNew(post, viewer, seenBefore) && <Badge tone="success">Nieuw</Badge>}
          </div>
        </div>
      </header>

      <div className="mt-3 space-y-3">
        <PlainText text={post.body} className="text-[15px] leading-7" />
        {post.videoUrl && <VideoLink url={post.videoUrl} title={`Video van ${post.author.name}`} />}
        <Attachments items={post.attachments} />
      </div>

      <PostTools viewer={viewer} post={post} />

      <section className="mt-4 space-y-3 border-t border-line pt-4" aria-label="Reacties">
        {post.comments.map((comment) => (
          <Comment key={comment.id} viewer={viewer} comment={comment} seenBefore={seenBefore} />
        ))}
        {canComment(viewer, post) ? (
          <form action={createComment} className="space-y-2">
            <input type="hidden" name="postId" value={post.id} />
            <label htmlFor={`reactie-op-${post.id}`} className="sr-only">
              Reageer
            </label>
            <textarea id={`reactie-op-${post.id}`} name="body" rows={1} maxLength={LIMITS.comment} placeholder="Schrijf een reactie…" className="input py-2" />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <AttachmentPicker compact />
              <SubmitButton className="btn-secondary py-1.5" pendingText="Plaatsen…">
                Reageren
              </SubmitButton>
            </div>
          </form>
        ) : (
          post.hiddenAt && <p className="text-xs text-muted">Op een verborgen bericht kan niet worden gereageerd.</p>
        )}
      </section>
    </article>
  );
}

function PostTools({ viewer, post }: { viewer: Viewer; post: PostView }) {
  const edit = canEditItem(viewer, post);
  const remove = canDeleteItem(viewer, post);
  const moderator = canModerate(viewer);
  const report = canReport(viewer, post);
  if (!edit && !remove && !moderator && !report) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1 text-sm">
      {edit && (
        <details className="w-full sm:w-auto [&[open]]:w-full">
          <summary className="btn-ghost inline-flex cursor-pointer py-1">Bewerken</summary>
          <form action={updatePost} className="mt-2 space-y-2">
            <input type="hidden" name="postId" value={post.id} />
            <textarea name="body" rows={4} defaultValue={post.body} maxLength={LIMITS.post} className="input" aria-label="Tekst" />
            <input name="videoUrl" type="text" inputMode="url" defaultValue={post.videoUrl} placeholder="Videolink (YouTube of Vimeo)" className="input" aria-label="Videolink" />
            {post.attachments.length > 0 && (
              <fieldset className="space-y-1">
                <legend className="text-xs text-muted">Bijlagen weghalen</legend>
                {post.attachments.map((a) => (
                  <label key={a.id} className="flex items-center gap-2">
                    <input type="checkbox" name="removeAttachment" value={a.id} /> <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <SubmitButton className="btn-primary py-1.5">Opslaan</SubmitButton>
          </form>
        </details>
      )}
      {moderator && (
        <form action={setPostPinned}>
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="pin" value={post.pinnedAt ? "0" : "1"} />
          <SubmitButton className="btn-ghost py-1">{post.pinnedAt ? "Losmaken" : "Vastpinnen"}</SubmitButton>
        </form>
      )}
      {moderator && (
        <form action={setPostHidden}>
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="hide" value={post.hiddenAt ? "0" : "1"} />
          <SubmitButton className="btn-ghost py-1">{post.hiddenAt ? "Weer tonen" : "Verbergen"}</SubmitButton>
        </form>
      )}
      {remove && (
        <form action={deletePost}>
          <input type="hidden" name="postId" value={post.id} />
          <SubmitButton className="btn-ghost py-1 text-bordeaux" confirm="Dit bericht met alle reacties verwijderen? Dit kan niet ongedaan worden.">
            Verwijderen
          </SubmitButton>
        </form>
      )}
      {report && <ReportForm kind="post" id={post.id} />}
    </div>
  );
}

function ReportForm({ kind, id }: { kind: "post" | "comment"; id: string }) {
  return (
    <details className="w-full sm:w-auto [&[open]]:w-full">
      <summary className="btn-ghost inline-flex cursor-pointer py-1">Melden</summary>
      <form action={reportItem} className="mt-2 space-y-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <label className="label" htmlFor={`reden-${id}`}>
          Wat is er aan de hand? (alleen Sabine ziet dit)
        </label>
        <textarea id={`reden-${id}`} name="reason" rows={2} maxLength={LIMITS.report} className="input" />
        <SubmitButton className="btn-secondary py-1.5">Melding sturen naar Sabine</SubmitButton>
      </form>
    </details>
  );
}

function Comment({ viewer, comment, seenBefore }: { viewer: Viewer; comment: CommentView; seenBefore: string | null }) {
  const moderator = canModerate(viewer);
  const edit = canEditItem(viewer, comment);
  const remove = canDeleteItem(viewer, comment);
  const report = canReport(viewer, comment);
  return (
    <div id={`reactie-${comment.id}`} className={`flex scroll-mt-20 gap-3 ${comment.hiddenAt ? "opacity-70" : ""}`}>
      <Avatar name={comment.author.name} owner={comment.author.role === "owner"} userId={comment.author.id} photoFileId={comment.author.photoFileId} />
      <div className="min-w-0 flex-1">
        <div className={`rounded-lg px-3 py-2 ${comment.hiddenAt ? "border border-dashed border-line" : "bg-cream"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Byline name={comment.author.name} owner={comment.author.role === "owner"} at={comment.createdAt} edited={comment.editedAt} />
            <div className="flex gap-1.5">
              {comment.hiddenAt && <Badge tone="bordeaux">{moderator ? "Verborgen" : "Verborgen door Sabine"}</Badge>}
              {isNew(comment, viewer, seenBefore) && <Badge tone="success">Nieuw</Badge>}
            </div>
          </div>
          <PlainText text={comment.body} className="mt-1 text-[15px] leading-6" />
          {comment.attachments.length > 0 && (
            <div className="mt-2">
              <Attachments items={comment.attachments} />
            </div>
          )}
        </div>
        {(edit || remove || moderator || report) && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
            {edit && (
              <details className="w-full sm:w-auto [&[open]]:w-full">
                <summary className="btn-ghost inline-flex cursor-pointer px-2 py-0.5 text-xs">Bewerken</summary>
                <form action={updateComment} className="mt-1 space-y-2">
                  <input type="hidden" name="commentId" value={comment.id} />
                  <textarea name="body" rows={2} defaultValue={comment.body} maxLength={LIMITS.comment} className="input" aria-label="Reactie" />
                  <SubmitButton className="btn-primary py-1.5">Opslaan</SubmitButton>
                </form>
              </details>
            )}
            {moderator && (
              <form action={setCommentHidden}>
                <input type="hidden" name="commentId" value={comment.id} />
                <input type="hidden" name="hide" value={comment.hiddenAt ? "0" : "1"} />
                <SubmitButton className="btn-ghost px-2 py-0.5 text-xs">{comment.hiddenAt ? "Weer tonen" : "Verbergen"}</SubmitButton>
              </form>
            )}
            {remove && (
              <form action={deleteComment}>
                <input type="hidden" name="commentId" value={comment.id} />
                <SubmitButton className="btn-ghost px-2 py-0.5 text-xs text-bordeaux" confirm="Deze reactie verwijderen?">
                  Verwijderen
                </SubmitButton>
              </form>
            )}
            {report && <ReportForm kind="comment" id={comment.id} />}
          </div>
        )}
      </div>
    </div>
  );
}

