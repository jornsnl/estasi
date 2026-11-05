-- Your Wedding Space (portal per couple), part of the Academy app.
--
-- Own schema "wedding_space" in the same database, so table names never clash
-- with the Academy's (both have e.g. settings and files). Every couple-owned
-- row carries couple_id; the server only queries with the couple of the
-- signed in account (the owner, Sabine, may open every couple). Nothing here
-- is reachable through the public Supabase API: see the end of this file.
--
-- The Academy role enum gets a third value for couple accounts.
do $$
begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'app_role') then
    alter type public.app_role add value if not exists 'couple';
  end if;
end $$;


create schema if not exists wedding_space;
set local search_path to wedding_space, public;

-- Catalogue managed by Sabine ---------------------------------------------------

create table packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Shown under the name, e.g. "De Breedenborg".
  variant text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  meetings integer not null default 3 check (meetings between 0 and 20),
  suppliers_enabled boolean not null default true,
  description text not null default '',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Starting tasks per package; copied into a couple's task board on creation.
create table package_tasks (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages (id) on delete cascade,
  lane text not null check (lane in ('couple', 'sabine', 'bride', 'groom')),
  title text not null,
  position integer not null default 0
);

create table supplier_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  archived boolean not null default false
);

-- Single row with Sabine's contact details and default texts.
create table settings (
  id boolean primary key default true check (id),
  business_name text not null default 'Estasi Weddings',
  contact_name text not null default 'Sabine Tillema',
  contact_email text not null default 'sabine@estasiweddings.nl',
  contact_phone text not null default '+31 6 37 15 38 99',
  contact_address text not null default 'Atoomweg 10, DPF 136, 9743 AK Groningen (De Printfabriek)',
  kvk text not null default '77140516',
  terms_url text not null default '',
  default_welcome text not null default 'Welkom in Your Wedding Space. Hier vinden jullie alles wat ik voor jullie bruiloft regel, overzichtelijk op één plek, zodat er voor jullie nog maar één ding overblijft: genieten.',
  -- Indicative content per meeting number (1, 2, 3, ...); Sabine can change it per couple.
  meeting_guides jsonb not null default '[]'::jsonb,
  detail_guide text not null default 'Op de trouwlocatie, vlak voor de bruiloft: de laatste check voordat alles vaststaat.',
  evaluation_guide text not null default 'Een ontspannen nagesprek na de bruiloft over de dag en onze samenwerking.'
);
insert into settings default values;

-- Couples -------------------------------------------------------------------------

create table couples (
  id uuid primary key default gen_random_uuid(),
  partner1_first text not null,
  partner1_last text not null default '',
  partner1_email text not null default '',
  partner1_phone text not null default '',
  partner2_first text not null default '',
  partner2_last text not null default '',
  partner2_email text not null default '',
  partner2_phone text not null default '',
  address text not null default '',
  wedding_date date,
  wedding_date_confirmed boolean not null default true,
  location text not null default '',
  package_id uuid references packages (id) on delete set null,
  suppliers_enabled boolean not null default true,
  welcome_text text not null default '',
  cover_file_id uuid,
  -- concept: only Sabine sees it; active: shared with the couple; archived: after the wedding.
  status text not null default 'concept' check (status in ('concept', 'active', 'archived')),
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

-- Members: Academy accounts (public.users, role 'couple') that belong to a couple.
-- No foreign key to public.users and text instead of uuid on purpose: in local
-- mode the Academy keeps its users in a JSON file with readable ids.
create table members (
  user_id text primary key,
  couple_id uuid not null references couples (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index members_couple_idx on members (couple_id);

-- Files (cover photos, meeting summaries, supplier documents) --------------------------

create table files (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples (id) on delete cascade,
  name text not null,
  mime text not null,
  size integer not null,
  data bytea not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index files_couple_idx on files (couple_id);
alter table couples add constraint couples_cover_fk foreign key (cover_file_id) references files (id) on delete set null;

-- Task board ------------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  lane text not null check (lane in ('couple', 'sabine', 'bride', 'groom')),
  title text not null,
  deadline date,
  notes text not null default '',
  position integer not null default 0,
  done_at timestamptz,
  done_by text,
  done_by_name text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);
create index tasks_couple_idx on tasks (couple_id, done_at);
create index tasks_sabine_idx on tasks (lane, done_at) where lane = 'sabine';

-- Questions block ----------------------------------------------------------------------------

create table questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  body text not null,
  asked_by text,
  asked_by_name text not null default '',
  asked_at timestamptz not null default now(),
  answer text,
  answered_by text,
  answered_at timestamptz
);
create index questions_couple_idx on questions (couple_id, answered_at);

-- Appointments and deadlines ----------------------------------------------------------------

create table appointments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  kind text not null check (kind in ('appointment', 'deadline')),
  title text not null,
  on_date date not null,
  at_time text not null default '',
  -- Appointments with Sabine show up in her own agenda.
  with_sabine boolean not null default false,
  notes text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);
create index appointments_couple_idx on appointments (couple_id, on_date);
create index appointments_date_idx on appointments (on_date);

-- "Jullie Pakket": meetings with their summaries ----------------------------------------------

create table meetings (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  kind text not null check (kind in ('meeting', 'detail', 'evaluation')),
  title text not null,
  guide text not null default '',
  planned_on date,
  summary text not null default '',
  summary_file_id uuid references files (id) on delete set null,
  status text not null default 'planned' check (status in ('to_plan', 'planned', 'done', 'skipped')),
  position integer not null default 0
);
create index meetings_couple_idx on meetings (couple_id, position);

-- "Jullie leveranciers": one row per category per couple -----------------------------------------

create table couple_suppliers (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  category_id uuid not null references supplier_categories (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'talking', 'booked')),
  name text not null default '',
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (couple_id, category_id)
);

create table supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references couple_suppliers (id) on delete cascade,
  file_id uuid not null references files (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Budget ---------------------------------------------------------------------------------------

create table budget_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  name text not null,
  category text not null default '',
  budget_cents integer not null default 0 check (budget_cents >= 0),
  actual_cents integer check (actual_cents >= 0),
  deposit_cents integer check (deposit_cents >= 0),
  deposit_due date,
  payment_due date,
  paid boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index budget_couple_idx on budget_items (couple_id, position);

-- Activity, for Sabine's notifications ----------------------------------------------------------

create table activity (
  id bigserial primary key,
  couple_id uuid references couples (id) on delete cascade,
  account_id text,
  action text not null,
  at timestamptz not null default now()
);
create index activity_at_idx on activity (at);

-- Starting catalogue (Sabine can change all of this in Beheer) -------------------------------------

insert into supplier_categories (name, position) values
  ('Locatie', 1), ('Catering', 2), ('Fotograaf', 3), ('Videograaf', 4),
  ('Styling', 5), ('Bloemist', 6), ('Muziek / dj', 7), ('Ceremonie', 8);

with p as (
  insert into packages (name, variant, price_cents, meetings, suppliers_enabled, position) values
    ('Ceremoniemeester', '', 0, 3, true, 1),
    ('Weddingplanner', '', 0, 6, true, 2),
    ('Openingsdans: Just the Two of Us', '2 privélessen', 59500, 0, false, 3),
    ('Openingsdans: Our Song', '3 privélessen', 75000, 0, false, 4),
    ('Openingsdans: The Showstopper', '4 privélessen incl. generale repetitie', 95000, 0, false, 5),
    ('Advies en Regie', 'De Breedenborg', 0, 1, true, 6),
    ('Professioneel Ceremoniemeester', 'De Breedenborg', 0, 2, true, 7),
    ('Weddingplanner', 'De Breedenborg', 0, 4, true, 8)
  returning id, suppliers_enabled
)
insert into package_tasks (package_id, lane, title, position)
select p.id, t.lane, t.title, t.position
from p
cross join (values
  ('sabine', 'Eerste meeting inplannen', 1),
  ('sabine', 'Draaiboek opzetten', 2),
  ('sabine', 'RSVP-pagina inrichten', 3),
  ('couple', 'Moodboard maken', 1),
  ('couple', 'Budgetplanning: totaalbedrag en prioriteiten', 2),
  ('bride', 'Trouwjurk uitzoeken', 1),
  ('bride', 'Sieraden uitzoeken', 2),
  ('bride', 'Trouwschoenen uitzoeken', 3),
  ('bride', 'Geloften schrijven', 4),
  ('groom', 'Trouwpak uitzoeken', 1),
  ('groom', 'Accessoires uitzoeken', 2),
  ('groom', 'Trouwschoenen uitzoeken', 3),
  ('groom', 'Geloften schrijven', 4)
) as t (lane, title, position)
where p.suppliers_enabled;

update settings set meeting_guides = '[
  "Overzicht en start: een diepere kennismaking, de dagindeling vaststellen als basis voor het draaiboek, en een eerste check welke leveranciers nog geregeld moeten worden.",
  "Verdieping en afstemming: het draaiboek samen doornemen, het stylingplan bespreken en de gastenlijst bespreken.",
  "Afronding en final check: laatste taken vaststellen en de puntjes op de i; de gastenlijst mag hier nogmaals terugkomen."
]'::jsonb;

-- Keep the tables away from Supabase's public Data API. Row level security
-- without policies closes every table to the API roles; the app connects as
-- the table owner, which RLS does not apply to.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'wedding_space' loop
    execute format('alter table wedding_space.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema wedding_space from anon, authenticated';
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
    execute 'revoke all on all sequences in schema wedding_space from anon, authenticated';
    execute 'alter default privileges in schema wedding_space revoke all on tables from anon, authenticated';
  end if;
end $$;
