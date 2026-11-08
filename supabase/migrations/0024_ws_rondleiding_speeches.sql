-- Feedback Sabine, Your Wedding Space 11 (Rondleiding) and 12 (Speeches).
-- Only additions; existing data stays as it is.

set local search_path to wedding_space, public;

-- 11 The tour video on the couple's start page: an upload or a YouTube/Vimeo link, the same for every couple.
alter table settings add column if not exists tour_video_url text not null default '';
alter table settings add column if not exists tour_video_file_id uuid references files (id) on delete set null;

-- The welcome block with the tour button, until the couple closes it (once per couple, not per browser).
create table if not exists tour_welcome_dismissed (
  couple_id uuid primary key references couples (id) on delete cascade,
  dismissed_by_name text not null default '',
  dismissed_at timestamptz not null default now()
);

alter table tour_welcome_dismissed enable row level security;

-- 12 Speeches: only Sabine (beheer) reads and writes them; couples never, a speech can be a surprise.
create table if not exists speeches (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  -- Picked from the guest list; the name is kept in speaker_name as well, so it stays when the guest goes.
  guest_id uuid references guests (id) on delete set null,
  speaker_name text not null default '',
  relation text not null default '',
  moment text not null default '' check (moment in ('', 'ceremonie', 'diner', 'receptie', 'avond', 'eigen')),
  moment_other text not null default '',
  -- "hh:mm", or empty when there is no planned time yet.
  planned_time text not null default '',
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 600),
  -- Keys: microfoon, beamer, laptop, muziek, presentatie; needs_other is the own entry (comma separated).
  needs text[] not null default '{}',
  needs_other text not null default '',
  phone text not null default '',
  email text not null default '',
  status text not null default 'aangemeld' check (status in ('aangemeld', 'bevestigd', 'materiaal', 'techniek')),
  surprise boolean not null default false,
  notes text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists speeches_couple_idx on speeches (couple_id, position);

alter table speeches enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
