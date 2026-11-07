-- Feedback Sabine, eten en allergieën (punt 16): meal moments as columns,
-- three kinds of rows (people, own groups, RSVP groups with automatic counts),
-- and per guest "deel van de dag" exceptions.

set local search_path to wedding_space, public;

create table if not exists default_meal_moments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0
);
insert into default_meal_moments (name, position)
select n, p from (values ('Ontbijt', 1), ('Lunch', 2), ('Taart/sweets', 3), ('Borrelhapjes (middag)', 4), ('Diner', 5),
                         ('Borrelhapjes (avond)', 6), ('Late night snack', 7)) as d (n, p)
where not exists (select 1 from default_meal_moments);

create table if not exists meal_moments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  at_time text not null default '',
  caterer text not null default '',
  menu text not null default '',
  updated_by_name text not null default '',
  updated_at timestamptz,
  position integer not null default 0
);
create index if not exists meal_moments_couple_idx on meal_moments (couple_id, position);

-- kind person: a tick per moment (counts as 1); group: a number per moment;
-- rsvp: a guest group (adults or children), on/off per moment, the number comes from the RSVP.
create table if not exists meal_rows (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  kind text not null check (kind in ('person', 'group', 'rsvp')),
  name text not null default '',
  role text not null default '',
  group_id uuid references guest_groups (id) on delete cascade,
  kids boolean not null default false,
  diet text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists meal_rows_couple_idx on meal_rows (couple_id, position);
create unique index if not exists meal_rows_rsvp_idx on meal_rows (group_id, kids) where kind = 'rsvp';

create table if not exists meal_cells (
  row_id uuid not null references meal_rows (id) on delete cascade,
  moment_id uuid not null references meal_moments (id) on delete cascade,
  checked boolean not null default false,
  count integer not null default 0 check (count >= 0),
  primary key (row_id, moment_id)
);

-- A guest there for part of the day who does not eat along at this moment.
create table if not exists guest_meal_exclusions (
  guest_id uuid not null references guests (id) on delete cascade,
  moment_id uuid not null references meal_moments (id) on delete cascade,
  primary key (guest_id, moment_id)
);
-- "Nog controleren" until someone has looked at this guest's moments.
alter table guests add column if not exists meals_reviewed boolean not null default false;

insert into meal_moments (couple_id, name, position)
select c.id, d.name, d.position from couples c cross join default_meal_moments d
 where not exists (select 1 from meal_moments m where m.couple_id = c.id);

alter table default_meal_moments enable row level security;
alter table meal_moments enable row level security;
alter table meal_rows enable row level security;
alter table meal_cells enable row level security;
alter table guest_meal_exclusions enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
