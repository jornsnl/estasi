-- Feedback Sabine, draaiboek (punten 9 tot en met 15, 18 en 19):
-- names with a colour per couple, rows that know who added them, fixed tabs
-- for the packing lists, group photos and the guest list, and no "Overig".

set local search_path to wedding_space, public;

-- Names with a colour ("Wie" in the day planning) ---------------------------------------------
create table if not exists couple_people (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  name text not null,
  color text not null default '#E8C9CF',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists couple_people_name_idx on couple_people (couple_id, lower(name));

-- The partners are always on the list, each with an own colour.
insert into couple_people (couple_id, name, color, position)
select id, partner1_first, '#E8C9CF', 1 from couples where partner1_first <> ''
on conflict do nothing;
insert into couple_people (couple_id, name, color, position)
select id, partner2_first, '#D9E4CF', 2 from couples where partner2_first <> ''
on conflict do nothing;

-- Rows: several names, and who added the row (the couple cannot change Sabine's rows).
alter table runsheet_rows add column if not exists people text[] not null default '{}';
alter table runsheet_rows add column if not exists created_by text;
alter table runsheet_rows add column if not exists by_admin boolean not null default false;
alter table runsheet_rows add column if not exists created_by_name text not null default '';
-- Existing rows count as Sabine's only when nobody can tell; the couple keeps editing them.
update runsheet_rows set people = array_remove(regexp_split_to_array(trim(who), '\s*(,|&|\sen\s)\s*'), '') where who <> '' and people = '{}';

insert into couple_people (couple_id, name, color, position)
select distinct on (r.couple_id, lower(p.name)) r.couple_id, p.name,
       (array['#F1E3C4', '#CFDDE6', '#E6D5EA', '#F3D6C4', '#DCD3C2', '#C9E2DD'])[1 + (abs(hashtext(lower(p.name))) % 6)], 10
  from runsheet_rows r cross join lateral unnest(r.people) as p (name)
 where p.name <> ''
on conflict do nothing;

-- Tabs of a fixed kind -------------------------------------------------------------------------
alter table runsheet_tabs drop constraint if exists runsheet_tabs_kind_check;
alter table runsheet_tabs add constraint runsheet_tabs_kind_check
  check (kind in ('schedule', 'list', 'seating', 'packing', 'photos', 'guests', 'styling'));

-- "Overig" goes (only when empty, so nothing is lost).
delete from runsheet_tabs t where t.title = 'Overig' and not exists (select 1 from runsheet_rows r where r.tab_id = t.id);
-- Empty "Opstelling" and "Meeneemlijst" list tabs become the new special tabs.
update runsheet_tabs t set kind = 'seating' where t.title = 'Opstelling' and t.kind = 'list' and not exists (select 1 from runsheet_rows r where r.tab_id = t.id);
update runsheet_tabs t set kind = 'packing' where t.title = 'Meeneemlijst' and t.kind = 'list' and not exists (select 1 from runsheet_rows r where r.tab_id = t.id);

insert into runsheet_tabs (couple_id, title, kind, position)
select c.id, t.title, t.kind, t.position
  from couples c cross join (values
    ('Opstelling', 'seating', 2), ('Meeneemlijst', 'packing', 3), ('Stylingplan', 'styling', 4),
    ('Groepsfoto''s', 'photos', 5), ('Gastenlijst', 'guests', 6)
  ) as t (title, kind, position)
 where not exists (select 1 from runsheet_tabs x where x.couple_id = c.id and x.kind = t.kind);

-- Packing lists ---------------------------------------------------------------------------------
create table if not exists default_packing_items (
  id uuid primary key default gen_random_uuid(),
  list_kind text not null check (list_kind in ('wedding', 'bag', 'styling')),
  what text not null,
  position integer not null default 0
);

create table if not exists packing_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  list_kind text not null check (list_kind in ('wedding', 'bag', 'styling')),
  what text not null,
  who text not null default '',
  packed boolean not null default false,
  -- Standard items cannot be deleted by the couple.
  is_default boolean not null default false,
  created_by text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists packing_items_couple_idx on packing_items (couple_id, list_kind, position);

insert into default_packing_items (list_kind, what, position)
select k, w, p from (values
  ('wedding', 'ID-kaarten', 1), ('wedding', 'Geloften', 2), ('wedding', 'Trouwjurk + sluier', 3), ('wedding', 'Trouwpak + stropdas/strik', 4),
  ('wedding', 'Trouwringen', 5), ('wedding', 'Trouwschoenen', 6), ('wedding', 'Sieraden/horloge', 7), ('wedding', 'Haaraccessoires', 8),
  ('wedding', 'Badjas/robe tijdens het opmaken', 9), ('wedding', 'Extra paar schoenen (dansvloer)', 10), ('wedding', 'Trouwboeket', 11),
  ('wedding', 'Muziek/playlists', 12), ('wedding', 'Mooie kledinghanger voor de jurk', 13), ('wedding', 'Extra overhemd', 14),
  ('bag', 'Deo', 1), ('bag', 'Smint/pepermunt', 2), ('bag', 'Lenzenvloeistof', 3), ('bag', 'Lippenbalsem/lipstick/gloss', 4),
  ('bag', 'Medicatie', 5), ('bag', 'Telefoon', 6), ('bag', 'Geloften', 7), ('bag', 'ID''s', 8), ('bag', 'Trouwringen', 9),
  ('bag', 'Tissues/zakdoekjes', 10)
) as d (k, w, p)
where not exists (select 1 from default_packing_items);

-- Existing couples get the standard items, with both first names as "who".
insert into packing_items (couple_id, list_kind, what, who, is_default, position)
select c.id, d.list_kind, d.what, trim(both ' &' from c.partner1_first || ' & ' || c.partner2_first), true, d.position
  from couples c cross join default_packing_items d
 where not exists (select 1 from packing_items x where x.couple_id = c.id);

-- Group photos ----------------------------------------------------------------------------------
create table if not exists group_photos (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  who text not null,
  location text not null default '',
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists group_photos_couple_idx on group_photos (couple_id, position);

alter table settings add column if not exists group_photo_intro text not null default '';
update settings set group_photo_intro = E'Zo maken jullie een fijne fotoplanning\n\nGroepsfoto''s gaan het snelst als jullie ze in een logische volgorde zetten. Begin met de grootste groep en werk zo naar kleinere groepjes toe. Willen jullie bijvoorbeeld familiefoto''s? Zet dan eerst de hele familie op de foto. Daarna is het een kwestie van mensen laten weglopen, zodat de kleinere familiefoto''s vanzelf volgen.\n\nJullie kunnen er ook voor kiezen om te beginnen met een foto met iedereen erop. Dan is iedereen er meteen bij. Houd er wel rekening mee dat de gasten daarna vaak blijven kijken bij de rest van de foto''s. Kies dus wat voor jullie prettig voelt.\n\nLet er ook op dat niemand onnodig lang hoeft te wachten. Staat iemand op meerdere foto''s, bijvoorbeeld jullie oom of een van de getuigen? Zet die foto''s dan direct achter elkaar, en niet één aan het begin en één aan het eind. Zo kan iedereen snel weer genieten van de borrel.'
 where group_photo_intro = '';

alter table couple_people enable row level security;
alter table default_packing_items enable row level security;
alter table packing_items enable row level security;
alter table group_photos enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
