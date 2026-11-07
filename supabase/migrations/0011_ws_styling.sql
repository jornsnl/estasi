-- Feedback Sabine, stylingplan en opdracht Thema & Styling (punten 17, 35 en 39):
-- * the styling plan per place (items, who arranges it, ready on the day, images)
-- * an assignment made of parts with note fields, a moodboard part and a
--   "done" tick per part; Sabine manages the texts centrally
-- * notices for Sabine's dashboard (e.g. all parts of an assignment done)

set local search_path to wedding_space, public;

-- Styling plan per place ------------------------------------------------------------------------
alter table settings add column if not exists default_styling_places jsonb not null default
  '["Entree", "Ceremoniezaal", "Ontvangstzaal", "Receptieruimte", "Diner", "Feestzaal"]'::jsonb;

create table if not exists styling_places (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists styling_places_couple_idx on styling_places (couple_id, position);

create table if not exists styling_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  place_id uuid not null references styling_places (id) on delete cascade,
  what text not null,
  who text not null default '',
  ready boolean not null default false,
  -- A proposal from the AI summary: only Sabine sees it until she releases it.
  draft boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists styling_items_place_idx on styling_items (place_id, position);

create table if not exists styling_place_images (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  place_id uuid not null references styling_places (id) on delete cascade,
  file_id uuid not null references files (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into styling_places (couple_id, name, position)
select c.id, p.name, p.ord
  from couples c
 cross join lateral jsonb_array_elements_text((select default_styling_places from settings limit 1)) with ordinality as p (name, ord)
 where not exists (select 1 from styling_places x where x.couple_id = c.id);

-- Assignments made of parts -----------------------------------------------------------------------
alter table assignment_templates add column if not exists kind text not null default 'questions';
alter table assignment_templates add column if not exists closing text not null default '';
alter table assignments add column if not exists kind text not null default 'questions';
alter table assignments add column if not exists closing text not null default '';
alter table assignments add column if not exists completed_at timestamptz;

-- fields: [{"key": "f1", "label": "Ceremonie", "prompts": ["...", "..."]}], one note field each.
-- kind moodboard: also Pinterest boards (embeds), an example image, uploads and a link field.
create table if not exists assignment_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references assignment_templates (id) on delete cascade,
  title text not null,
  intro text not null default '',
  kind text not null default 'notes' check (kind in ('notes', 'moodboard')),
  fields jsonb not null default '[]'::jsonb,
  tips jsonb not null default '[]'::jsonb,
  embeds jsonb not null default '[]'::jsonb,
  example_file_id uuid references files (id) on delete set null,
  notice text not null default '',
  position integer not null default 0
);

create table if not exists assignment_sections (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments (id) on delete cascade,
  title text not null,
  intro text not null default '',
  kind text not null default 'notes' check (kind in ('notes', 'moodboard')),
  fields jsonb not null default '[]'::jsonb,
  tips jsonb not null default '[]'::jsonb,
  embeds jsonb not null default '[]'::jsonb,
  example_file_id uuid references files (id) on delete set null,
  notice text not null default '',
  answers jsonb not null default '{}'::jsonb,
  link text not null default '',
  completed_at timestamptz,
  position integer not null default 0
);
create index if not exists assignment_sections_idx on assignment_sections (assignment_id, position);

-- Notices for Sabine's dashboard ------------------------------------------------------------------
create table if not exists admin_notices (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples (id) on delete cascade,
  text text not null,
  link text not null default '',
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

-- The new "Thema & Styling" template replaces "Thema & Moodboard maken" ---------------------------
update assignment_templates set archived = true where title = 'Thema & Moodboard maken';

do $$
declare t uuid;
begin
  if exists (select 1 from assignment_templates where title = 'Thema & Styling') then
    return;
  end if;
  insert into assignment_templates (title, intro, styling_source, position, kind, closing)
  values (
    'Thema & Styling',
    'Deze pagina helpt jullie om jullie stijl en sfeer voor de bruiloft te ontdekken. Zie dit als een fijn, creatief huiswerkmoment. Met kleine opdrachten en gerichte vragen ontdekken jullie stap voor stap wat bij jullie past. Denk na over gevoel, kleuren, omgeving, bloemen en aankleding. Alles wat jullie hier verzamelen, vormt straks de basis voor het stylingplan.',
    true, 1, 'sections',
    'Super! Jullie hebben alle opdrachten over het onderdeel Thema & Styling afgerond. Ik ga nu aan de slag met het gehele stylingplan. Jullie vinden het straks op deze pagina, onder Stylingplan.'
  ) returning id into t;

  insert into assignment_template_sections (template_id, title, intro, kind, fields, tips, notice, position) values
  (t, 'Opdracht 1: Jullie gevoel bepalen', 'Neem samen rustig de tijd voor deze vragen en noteer jullie antwoorden.', 'notes',
   '[{"key":"f1","label":"","prompts":["Hoe willen jullie je voelen op de trouwdag?","Hoe willen jullie dat jullie gasten zich voelen?","Welke drie woorden passen het best bij de sfeer die jullie zoeken?"]}]', '[]', '', 1),
  (t, 'Opdracht 2: Moodboard maken', 'Maak een visueel moodboard dat laat zien wat jullie mooi vinden. Dit mag via Pinterest, Canva of door afbeeldingen te verzamelen. Jullie kunnen allebei een eigen moodboard maken of samen één. Zoek op Google of Pinterest naar inspiratie, er zijn zoveel leuke ideeën!', 'moodboard',
   '[]', '["Bloemen die jullie mooi vinden","Kleuren die jullie aanspreken","Materialen zoals hout, linnen, glas of goud","Setting zoals binnen, buiten, bos, strand, landelijk of industrieel"]', '', 2),
  (t, 'Opdracht 3: Jullie stijl ontdekken', 'Beantwoord samen deze vragen:', 'notes',
   '[{"key":"f1","label":"","prompts":["Voelt jullie stijl meer romantisch of modern?","Houden jullie meer van zachte tinten of juist uitgesproken kleuren?","Past minimalistisch of juist rijkelijk aangekleed beter bij jullie?","Zijn er bepaalde kleuren die jullie absoluut niet mooi vinden?"]}]', '[]', '', 3),
  (t, 'Opdracht 4: Styling per moment van de dag', 'Denk per onderdeel van de dag na over de sfeer en aankleding.', 'notes',
   '[{"key":"ceremonie","label":"Ceremonie","prompts":["Willen jullie dit binnen of buiten?","Willen jullie een intieme setting of een open, ruime setting?","Welke elementen mogen echt niet ontbreken?","Willen jullie planten bij de ceremonie?"]},{"key":"receptie","label":"Receptie / Toast","prompts":["Willen jullie dit binnen of buiten?","Willen jullie een intieme setting of een open, ruime setting?","Staand of zittend?","Welke elementen mogen echt niet ontbreken?","Willen jullie planten bij de receptie?"]},{"key":"diner","label":"Diner","prompts":["Willen jullie lange tafels of ronde tafels?","Meer kaarslicht of daglicht?","Bloemen of groen?"]},{"key":"feest","label":"Feest","prompts":["Moet dit voelen als een chic avondfeest, of een ontspannen festival- of feesttentsfeer? Denk aan licht, rook, confetti, bloemen."]}]', '[]', '', 4),
  (t, 'Opdracht 5: Omgeving en locatie', 'Denk na over de plek waar jullie gaan trouwen.', 'notes',
   '[{"key":"f1","label":"","prompts":["Past een buitenlocatie of juist binnen beter bij jullie gevoel?","Houden jullie van natuur, water, stad of een landelijke omgeving?","Wat moet de locatie uitstralen?"]}]', '[]', '', 5),
  (t, 'Opdracht 6: Afronding', '', 'notes',
   '[{"key":"f1","label":"","prompts":["Wat hebben jullie ontdekt over jullie stijl?","Welke elementen voelen echt als \"dit zijn wij\"?","Wat willen jullie dat ik zeker meeneem in het stylingplan?"]}]', '[]',
   'Belangrijk: ik ontwerp alleen het plan, maar verzorg niet de uitvoering. Hiervoor kunnen we samen kijken naar leveranciers die dit mogelijk kunnen maken. Tijdens de trouwdag is er dus iemand extern nodig voor de styling.', 6);
end $$;

-- Couples whose old assignment is still empty get the new one in its place.
do $$
declare a record; tpl uuid;
begin
  select id into tpl from assignment_templates where title = 'Thema & Styling' limit 1;
  for a in
    select x.id, x.couple_id, x.position from assignments x
     where x.title = 'Thema & Moodboard maken'
       and not exists (select 1 from assignment_questions q where q.assignment_id = x.id and q.answer <> '')
  loop
    delete from assignments where id = a.id;
    with n as (
      insert into assignments (couple_id, template_id, title, intro, styling_source, position, kind, closing)
      select a.couple_id, t.id, t.title, t.intro, t.styling_source, a.position, t.kind, t.closing from assignment_templates t where t.id = tpl
      returning id
    )
    insert into assignment_sections (assignment_id, title, intro, kind, fields, tips, embeds, example_file_id, notice, position)
    select n.id, s.title, s.intro, s.kind, s.fields, s.tips, s.embeds, s.example_file_id, s.notice, s.position
      from n cross join assignment_template_sections s where s.template_id = tpl;
  end loop;
end $$;

alter table styling_places enable row level security;
alter table styling_items enable row level security;
alter table styling_place_images enable row level security;
alter table assignment_template_sections enable row level security;
alter table assignment_sections enable row level security;
alter table admin_notices enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
