-- Feedback Sabine, opstelling (punt 13): dinner and ceremony seating plans
-- with a box per chair, guests placed from the RSVP and styling blocks.

set local search_path to wedding_space, public;

create table if not exists seating_layouts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  kind text not null check (kind in ('dinner', 'ceremony')),
  name text not null,
  -- Guest groups whose guests can be placed.
  group_ids uuid[] not null default '{}',
  -- Ceremony: rows (left and right of an aisle), half circle or circle.
  shape text not null default 'rows' check (shape in ('rows', 'half', 'circle')),
  rows integer not null default 6 check (rows between 1 and 40),
  seats_per_row integer not null default 6 check (seats_per_row between 1 and 40),
  side_left text not null default '',
  side_right text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists seating_layouts_couple_idx on seating_layouts (couple_id, position);

-- Dinner tables; x and y in percent of the floor plan.
create table if not exists seating_tables (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references seating_layouts (id) on delete cascade,
  shape text not null default 'round' check (shape in ('round', 'square', 'long')),
  name text not null default '',
  x real not null default 50,
  y real not null default 50,
  rotation integer not null default 0 check (rotation in (0, 90)),
  seats integer not null default 8 check (seats between 1 and 60),
  long_sides text not null default 'both' check (long_sides in ('both', 'one')),
  head_seats boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per chair that has someone on it: a guest from the RSVP, or a typed name.
create table if not exists seating_seats (
  layout_id uuid not null references seating_layouts (id) on delete cascade,
  seat_key text not null,
  guest_id uuid references guests (id) on delete set null,
  name text not null default '',
  primary key (layout_id, seat_key)
);

-- Styling items (from the places Ceremoniezaal or Diner) placed on the plan.
create table if not exists seating_blocks (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references seating_layouts (id) on delete cascade,
  styling_item_id uuid not null references styling_items (id) on delete cascade,
  x real not null default 50,
  y real not null default 50,
  unique (layout_id, styling_item_id)
);

alter table seating_layouts enable row level security;
alter table seating_tables enable row level security;
alter table seating_seats enable row level security;
alter table seating_blocks enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
