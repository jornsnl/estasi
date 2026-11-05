-- Your Wedding Space, fase 2 and 3: run sheet (draaiboek), guest list and
-- RSVP, assignments (opdrachten) with AI summaries, styling plan, and
-- Sabine's photo for the contact card. Same rules as 0003: own schema,
-- couple_id on every couple-owned row, closed to the public Supabase API.

set local search_path to wedding_space, public;

-- Sabine's photo in the contact card ---------------------------------------------
alter table settings add column if not exists contact_photo_file_id uuid references files (id) on delete set null;

-- Draaiboek -------------------------------------------------------------------------
-- Expected guests, shown at the top of the run sheet ("40 overdag (10 kids) · 70 's avonds").
alter table couples add column if not exists guests_day integer check (guests_day >= 0);
alter table couples add column if not exists guests_day_kids integer check (guests_day_kids >= 0);
alter table couples add column if not exists guests_evening integer check (guests_evening >= 0);

create table runsheet_tabs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  title text not null,
  -- schedule: Tijd, Wie, Wat, Meer info, Waar, Waar (regen); list: Wat, Wie, Meer info.
  kind text not null default 'list' check (kind in ('schedule', 'list')),
  position integer not null default 0
);
create index runsheet_tabs_couple_idx on runsheet_tabs (couple_id, position);

create table runsheet_rows (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  tab_id uuid not null references runsheet_tabs (id) on delete cascade,
  at_time text not null default '',
  who text not null default '',
  what text not null default '',
  info text not null default '',
  location text not null default '',
  rain_location text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index runsheet_rows_tab_idx on runsheet_rows (tab_id, position);

-- Every existing couple gets the standard tabs (new couples get them on creation).
insert into runsheet_tabs (couple_id, title, kind, position)
select c.id, t.title, t.kind, t.position
from couples c
cross join (values ('Dagplanning', 'schedule', 1), ('Opstelling', 'list', 2), ('Meeneemlijst', 'list', 3), ('Overig', 'list', 4)) as t (title, kind, position);

-- Gastenlijst & RSVP ------------------------------------------------------------------
create table rsvp_forms (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  -- Random part of the public link /rsvp/<slug>; hard to guess.
  slug text not null unique,
  name text not null,
  intro text not null default '',
  ask_part_of_day boolean not null default false,
  ask_diet boolean not null default false,
  dresscode text not null default '',
  confirmation_text text not null default '',
  decline_text text not null default '',
  qr_color text not null default '#2c2c2c',
  qr_background text not null default '#ffffff',
  open boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index rsvp_forms_couple_idx on rsvp_forms (couple_id, position);

-- Extra questions per form, on top of the standard fields.
create table rsvp_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references rsvp_forms (id) on delete cascade,
  label text not null,
  kind text not null default 'text' check (kind in ('text', 'yesno')),
  position integer not null default 0
);

create table rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  form_id uuid references rsvp_forms (id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  relation text not null default '',
  attending text not null check (attending in ('yes', 'no', 'partial')),
  partial_note text not null default '',
  diet text not null default '',
  dresscode_ok boolean,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index rsvp_responses_couple_idx on rsvp_responses (couple_id, created_at);

-- One row per person, so the total can be counted; people who signed up
-- together share response_id and stay visibly linked.
create table guests (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  response_id uuid references rsvp_responses (id) on delete set null,
  form_id uuid references rsvp_forms (id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  relation text not null default '',
  email text not null default '',
  phone text not null default '',
  diet text not null default '',
  attendance text not null default 'yes' check (attendance in ('yes', 'no', 'partial')),
  partial_note text not null default '',
  is_kid boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index guests_couple_idx on guests (couple_id, created_at);

-- Opdrachten ------------------------------------------------------------------------------
-- Templates Sabine maintains; copied into a couple when it is created (or by hand).
create table assignment_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro text not null default '',
  -- Used to build the styling plan draft from this assignment.
  styling_source boolean not null default false,
  position integer not null default 0,
  archived boolean not null default false
);

create table assignment_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references assignment_templates (id) on delete cascade,
  prompt text not null,
  help text not null default '',
  position integer not null default 0
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  template_id uuid references assignment_templates (id) on delete set null,
  title text not null,
  intro text not null default '',
  styling_source boolean not null default false,
  -- Hidden from the couple until this date (null: visible right away).
  visible_from date,
  position integer not null default 0,
  submitted_at timestamptz,
  ai_summary text not null default '',
  ai_summary_at timestamptz,
  ai_error text not null default '',
  created_at timestamptz not null default now()
);
create index assignments_couple_idx on assignments (couple_id, position);

create table assignment_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments (id) on delete cascade,
  prompt text not null,
  help text not null default '',
  answer text not null default '',
  position integer not null default 0
);
create index assignment_questions_idx on assignment_questions (assignment_id, position);

-- Stylingplan & Moodboard ----------------------------------------------------------------
create table styling_plans (
  couple_id uuid primary key references couples (id) on delete cascade,
  concept text not null default '',
  colors jsonb not null default '[]'::jsonb,
  ai_draft text not null default '',
  ai_draft_at timestamptz,
  ai_error text not null default '',
  -- The couple only sees the plan once Sabine publishes it.
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table styling_images (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  file_id uuid not null references files (id) on delete cascade,
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index styling_images_couple_idx on styling_images (couple_id, created_at);

-- Starting templates ---------------------------------------------------------------------------
with t as (
  insert into assignment_templates (title, intro, styling_source, position) values
    ('Thema & Moodboard maken',
     'Neem hier rustig de tijd voor. Jullie antwoorden vormen de basis van jullie stylingplan: na het invullen maak ik er een eerste concept van, dat we samen verder verfijnen.',
     true, 1)
  returning id
)
insert into assignment_template_questions (template_id, prompt, help, position)
select t.id, q.prompt, q.help, q.position from t cross join (values
  ('Gevoel bepalen: welk gevoel willen jullie dat gasten hebben op jullie bruiloft?', 'Bijvoorbeeld: ontspannen, feestelijk, intiem, chic, speels.', 1),
  ('Moodboard: welke beelden spreken jullie aan? Plak links naar foto''s of Pinterest-borden.', 'Kies wat jullie mooi vinden, ook als het niet allemaal bij elkaar lijkt te passen.', 2),
  ('Stijl ontdekken: welke woorden passen bij jullie stijl, en wat willen jullie juist niet?', 'Bijvoorbeeld: romantisch, modern, botanisch, klassiek, industrieel.', 3),
  ('Styling per dagdeel: hoe zien jullie de ceremonie, het diner en het feest voor je?', '', 4),
  ('Omgeving en locatie: wat zijn de kleuren, materialen en sfeer van jullie locatie?', '', 5),
  ('Afronding: is er nog iets dat jullie absoluut willen, of absoluut niet?', '', 6)
) as q (prompt, help, position);

with t as (
  insert into assignment_templates (title, intro, position) values
    ('Budgetplanning & prioriteiten', 'Hoeveel willen jullie in totaal uitgeven, en waar willen jullie vooral in investeren?', 2)
  returning id
)
insert into assignment_template_questions (template_id, prompt, help, position)
select t.id, q.prompt, q.help, q.position from t cross join (values
  ('Welk totaalbedrag hebben jullie in gedachten voor de bruiloft?', 'Een richtbedrag is genoeg.', 1),
  ('Welke drie onderdelen zijn voor jullie het belangrijkst?', 'Bijvoorbeeld: eten, fotografie, muziek, locatie, styling.', 2),
  ('Waar mag wat jullie betreft op bespaard worden?', '', 3)
) as q (prompt, help, position);

-- Same lock-down as 0003 for the new tables.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'wedding_space' loop
    execute format('alter table wedding_space.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
    execute 'revoke all on all sequences in schema wedding_space from anon, authenticated';
  end if;
end $$;
