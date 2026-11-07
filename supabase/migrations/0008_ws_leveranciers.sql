-- Feedback Sabine, leveranciers (punten 24 tot en met 27):
-- * new standard categories, "Ceremonie" goes; couples can add their own
-- * five statuses, "Niet nodig" greys the row out
-- * several suppliers per category (several favourites from the recommendations)
-- * Sabine's recommendations ("Aanraders leveranciers") with photo, brochure
--   and her own experience; a new favourite notifies her

set local search_path to wedding_space, public;

-- Categories ---------------------------------------------------------------------------------
-- couple_id null: a standard category every couple gets; otherwise the couple's own.
alter table supplier_categories add column if not exists couple_id uuid references couples (id) on delete cascade;

update supplier_categories set archived = true where couple_id is null and name = 'Ceremonie';

insert into supplier_categories (name, position)
select n.name, n.position
from (values
  ('Trouwambtenaar / BABS', 9), ('Live muziek', 10), ('Entertainment', 11), ('Bloemist', 12),
  ('Content creator', 13), ('Taart / Sweet table', 14), ('Make-up & hair artist', 15), ('Trouwringen', 16),
  ('Trouwjurk', 17), ('Trouwpak', 18), ('Trouwauto', 19)
) as n (name, position)
where not exists (select 1 from supplier_categories c where c.couple_id is null and lower(c.name) = lower(n.name));

-- Suppliers: statuses and several per category --------------------------------------------------
alter table couple_suppliers drop constraint if exists couple_suppliers_status_check;
update couple_suppliers set status = 'tbd' where status = 'open';
alter table couple_suppliers alter column status set default 'tbd';
alter table couple_suppliers add constraint couple_suppliers_status_check
  check (status in ('tbd', 'favorite', 'talking', 'booked', 'not_needed'));
alter table couple_suppliers drop constraint if exists couple_suppliers_couple_id_category_id_key;
alter table couple_suppliers add column if not exists position integer not null default 0;
alter table couple_suppliers add column if not exists created_at timestamptz not null default now();
create index if not exists couple_suppliers_couple_idx on couple_suppliers (couple_id, category_id, position);

-- Recommendations ------------------------------------------------------------------------------
create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references supplier_categories (id) on delete cascade,
  name text not null,
  profession text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  photo_file_id uuid references files (id) on delete set null,
  brochure_file_id uuid references files (id) on delete set null,
  -- "Ervaring van Sabine": her own words about working with them.
  experience text not null default '',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists recommendations_category_idx on recommendations (category_id, position);

alter table couple_suppliers add column if not exists recommendation_id uuid references recommendations (id) on delete set null;

-- A couple marked a recommendation as favourite: Sabine gets a notice and, bundled, a mail.
create table if not exists favorite_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  recommendation_id uuid references recommendations (id) on delete cascade,
  created_at timestamptz not null default now(),
  mailed_at timestamptz,
  seen_at timestamptz
);
create index if not exists favorite_events_open_idx on favorite_events (created_at) where mailed_at is null;

alter table recommendations enable row level security;
alter table favorite_events enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
