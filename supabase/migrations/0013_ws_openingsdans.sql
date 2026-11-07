-- Feedback Sabine, De openingsdans (punt 23): the couple's wishes for the dance.

set local search_path to wedding_space, public;

create table if not exists dance_wishes (
  couple_id uuid primary key references couples (id) on delete cascade,
  -- Block 1: the dance
  description text not null default '',
  lifts boolean not null default false,
  dips boolean not null default false,
  spins boolean not null default false,
  special boolean not null default false,
  special_text text not null default '',
  experience text not null default '' check (experience in ('', 'none', 'some', 'lots')),
  -- Block 2: music, [{title, artist, link, note}]
  songs jsonb not null default '[]'::jsonb,
  song_mode text not null default 'first' check (song_mode in ('first', 'mix')),
  audio_file_id uuid references files (id) on delete set null,
  -- Block 3: inspiration and practical, videos [{url, note}]
  videos jsonb not null default '[]'::jsonb,
  clothing text not null default '',
  -- Block 4: Sabine's notes (structure, practice tips, practice videos)
  sabine_notes text not null default '',
  sabine_videos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dance_wishes enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
