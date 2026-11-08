-- Feedback Sabine, Your Wedding Space 13: a student of the Academy (package B) who walks along at a
-- wedding may read that couple's run sheet, after the couple agreed. Only additions.
--
-- Everything goes through the server (src/lib/ws/meekijkers.ts), which checks the role, the
-- couple's consent and the end date on every request. The end date is not stored: it is 7 days
-- after the wedding date, worked out on every request, so a moved wedding date moves it as well.

set local search_path to wedding_space, public;

create table if not exists draaiboek_access (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  student_user_id uuid not null references public.users (id) on delete cascade,
  -- pending: waits for the couple; active: the couple agreed; declined: "Liever niet"; revoked: taken back.
  -- "Verlopen" (7 days after the wedding) is worked out, never stored.
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'revoked')),
  -- Sabine, who asked (only the owner may).
  granted_by uuid references public.users (id) on delete set null,
  granted_by_name text not null default '',
  created_at timestamptz not null default now(),
  -- The couple's answer (Akkoord or Liever niet): when and by which login, for the records.
  decided_at timestamptz,
  decided_by_user_id text,
  decided_by_name text not null default '',
  approved_at timestamptz,
  revoked_at timestamptz,
  revoked_by text check (revoked_by in ('admin', 'couple')),
  revoked_by_name text not null default ''
);

-- One open request or access per student per couple; after a decline or revoke a new one is possible.
create unique index if not exists draaiboek_access_open_idx on draaiboek_access (couple_id, student_user_id)
  where status in ('pending', 'active');
create index if not exists draaiboek_access_student_idx on draaiboek_access (student_user_id);

alter table draaiboek_access enable row level security;

-- Every time a student opens the run sheet (it holds allergies: health data). Shown to Sabine.
create table if not exists draaiboek_access_views (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references draaiboek_access (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists draaiboek_access_views_idx on draaiboek_access_views (access_id, viewed_at desc);

alter table draaiboek_access_views enable row level security;
