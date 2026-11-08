-- Academy 14: the community (one shared space for every student with active
-- access and Sabine) and private messages between Sabine and one student.
-- New tables only; nothing existing changes. Everything is read and written
-- by the server (src/lib/community/), which checks who may see what. Row
-- level security is on and there are no policies, so the public Supabase API
-- sees nothing.

-- Posts in the community ------------------------------------------------------------------------

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null default '',
  -- A YouTube or Vimeo link, shown as an embedded player.
  video_url text not null default '',
  -- Pinned by Sabine: shown at the top.
  pinned_at timestamptz,
  -- Hidden by Sabine: only she (and the author, with a note) still sees it.
  hidden_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null default '',
  hidden_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);
create index if not exists community_comments_created_idx on public.community_comments (created_at desc);

-- A student reports a post or a comment to Sabine.
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_comments (id) on delete cascade,
  reporter_id uuid not null references public.users (id) on delete cascade,
  reason text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create index if not exists community_reports_open_idx on public.community_reports (created_at desc) where resolved_at is null;

-- Private messages: one conversation per student, between that student and Sabine --------------

create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  -- The conversation: always the student, whoever wrote the message.
  student_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null default '',
  video_url text not null default '',
  -- When the other side opened it.
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists private_messages_student_idx on public.private_messages (student_id, created_at);
create index if not exists private_messages_unread_idx on public.private_messages (student_id) where read_at is null;

-- Images, files and short videos of posts, comments and private messages -----------------------
-- The bytes are an ordinary Academy upload (public.files, bucket "academy"),
-- with belongs_to = the uploader (or the student of a private conversation),
-- so the general route /api/bestanden never shows them to anyone else. Other
-- viewers get them through /api/community/bestanden/[id], which checks the
-- post, comment or conversation first. A row without a parent is an upload
-- that was not posted (yet); those are removed after a day.

create table if not exists public.community_attachments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  uploader_id uuid not null references public.users (id) on delete cascade,
  post_id uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_comments (id) on delete cascade,
  message_id uuid references public.private_messages (id) on delete cascade,
  -- The conversation a private upload is for (set at upload time).
  conversation_id uuid references public.users (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'file')),
  name text not null default '',
  mime text not null default '',
  size integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_attachments_post_idx on public.community_attachments (post_id) where post_id is not null;
create index if not exists community_attachments_comment_idx on public.community_attachments (comment_id) where comment_id is not null;
create index if not exists community_attachments_message_idx on public.community_attachments (message_id) where message_id is not null;
create unique index if not exists community_attachments_file_idx on public.community_attachments (file_id);

-- Per person: what was seen, notification choices and when the last mail went out --------------

create table if not exists public.community_members (
  user_id uuid primary key references public.users (id) on delete cascade,
  -- Everything in the community up to here counts as read.
  community_seen_at timestamptz,
  email_enabled boolean not null default true,
  -- Bundled mail: the moment of the last mail and up to which item it went.
  community_mailed_at timestamptz,
  community_mailed_until timestamptz,
  private_mailed_at timestamptz,
  private_mailed_until timestamptz,
  community_pushed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Web Push subscriptions, one per browser or device.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reports enable row level security;
alter table public.private_messages enable row level security;
alter table public.community_attachments enable row level security;
alter table public.community_members enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.community_posts, public.community_comments, public.community_reports, public.private_messages,
  public.community_attachments, public.community_members, public.push_subscriptions from anon, authenticated;
