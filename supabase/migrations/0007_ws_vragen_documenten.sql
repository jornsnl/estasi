-- Feedback Sabine, overzicht en documenten:
-- * an answered question stays on the overview until the couple has opened it
-- * documents on "Jullie pakket" (fixed ones for every couple, extra ones per
--   couple) and on "Facturen & Offertes"

set local search_path to wedding_space, public;

alter table questions add column if not exists read_at timestamptz;
alter table questions add column if not exists read_by text;
-- Questions answered before this change count as read: they already moved to the history.
update questions set read_at = answered_at where answered_at is not null and read_at is null;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  -- null: a fixed document every couple sees (e.g. the checklist); a new version replaces the file for all.
  couple_id uuid references couples (id) on delete cascade,
  section text not null check (section in ('package', 'invoices')),
  title text not null,
  file_id uuid not null references files (id),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_couple_idx on documents (couple_id, section, position);

update settings set default_welcome = 'Welkom in Your Wedding Space. Hier vinden jullie alles met betrekking tot jullie bruiloft overzichtelijk op één plek, zodat er voor jullie maar één ding overblijft: genieten.';

alter table documents enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
