-- Wedding Plan Academy: initial schema for Supabase.
-- Mirrors src/lib/data/types.ts. Accounts live in auth.users (Supabase Auth);
-- app data is protected with row level security so a student can only ever
-- read and write their own answers, even with a leaked anon key.

create extension if not exists "pgcrypto";

-- Accounts --------------------------------------------------------------------

create type public.app_role as enum ('student', 'owner');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  last_active_at timestamptz
);

create table public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  phone text not null default '',
  city text not null default '',
  company_name text not null default '',
  photo_file_id uuid,
  instagram text not null default '',
  website text not null default '',
  intro text not null default '',
  goals text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'owner');
$$;

-- Enrollments and access ------------------------------------------------------

create type public.package_type as enum ('A', 'B');
create type public.practical_status as enum ('none', 'planned', 'completed');

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  package public.package_type not null,
  purchased_at timestamptz not null,
  ends_at timestamptz not null,
  paused_at timestamptz,
  pauses jsonb not null default '[]'::jsonb,
  revoked_at timestamptz,
  online_completed_at timestamptz,
  certificate_released_at timestamptz,
  certificate_code text unique,
  practical_status public.practical_status not null default 'none',
  owner_notes text not null default ''
);

create or replace function public.has_active_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments
    where user_id = auth.uid() and revoked_at is null and paused_at is null and ends_at > now()
  );
$$;

-- Course content --------------------------------------------------------------

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  position int not null
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  summary text not null default '',
  position int not null,
  -- Ordered list of blocks (video, text, download, question, choice, upload).
  blocks jsonb not null default '[]'::jsonb
);

-- Answers, feedback and progress ----------------------------------------------

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- No FK on lesson/block: answers outlive deleted lessons (retention policy).
  lesson_id uuid not null,
  block_id text not null,
  text text not null default '',
  choice text,
  files jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id, block_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id),
  text text not null,
  attachment jsonb,
  answer_version int not null,
  created_at timestamptz not null default now()
);

create table public.lesson_completions (
  user_id uuid not null references public.users (id) on delete cascade,
  lesson_id uuid not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Files (metadata; the bytes live in the private Storage bucket "academy") ----

create table public.files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mime text not null,
  size int not null,
  belongs_to uuid references public.users (id) on delete cascade, -- null = course material
  uploaded_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

-- Audit log and settings ------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid not null references public.users (id),
  target_user_id uuid references public.users (id) on delete set null,
  action text not null,
  details text not null default ''
);

create table public.settings (
  id boolean primary key default true check (id), -- single row
  welcome_video_url text not null default '',
  welcome_text text not null default '',
  contact_email text not null default '',
  practical_spots_available boolean not null default false,
  practical_spots_note text not null default '',
  answers_privacy_notice text not null default ''
);
insert into public.settings default values;

-- Row level security ----------------------------------------------------------

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.answers enable row level security;
alter table public.feedback enable row level security;
alter table public.lesson_completions enable row level security;
alter table public.files enable row level security;
alter table public.audit_log enable row level security;
alter table public.settings enable row level security;

-- Owner: full access everywhere.
create policy owner_all on public.users for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.profiles for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.enrollments for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.modules for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.lessons for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.answers for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.feedback for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.lesson_completions for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.files for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.audit_log for all using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.settings for all using (public.is_owner()) with check (public.is_owner());

-- Students: own account, profile and enrollment (enrollment is read only).
create policy self_read on public.users for select using (id = auth.uid());
create policy self_rw on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy self_read on public.enrollments for select using (user_id = auth.uid());

-- Students: content only while access is active.
create policy active_read on public.modules for select using (public.has_active_access());
create policy active_read on public.lessons for select using (public.has_active_access());
create policy any_read on public.settings for select using (auth.uid() is not null);

-- Students: own answers; writing only while access is active.
create policy self_read on public.answers for select using (user_id = auth.uid());
create policy self_insert on public.answers for insert with check (user_id = auth.uid() and public.has_active_access());
create policy self_update on public.answers for update using (user_id = auth.uid() and public.has_active_access())
  with check (user_id = auth.uid());
create policy self_read on public.feedback for select using (user_id = auth.uid());
create policy self_read on public.lesson_completions for select using (user_id = auth.uid());
create policy self_insert on public.lesson_completions for insert
  with check (user_id = auth.uid() and public.has_active_access());
create policy self_read on public.files for select
  using (belongs_to = auth.uid() or (belongs_to is null and public.has_active_access()));
create policy self_insert on public.files for insert with check (belongs_to = auth.uid() and uploaded_by = auth.uid());

create index answers_user_idx on public.answers (user_id);
create index feedback_user_idx on public.feedback (user_id);
create index audit_target_idx on public.audit_log (target_user_id, at desc);
