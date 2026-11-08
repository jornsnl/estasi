-- Feedback Sabine, draaiboek (punten 3.1, 3.2, 3.12 en 3.13):
-- the old "Opstelling" and "Meeneemlijst" list tabs go (their rows are moved
-- first), the tabs get Sabine's order, and the day planning gets rows from
-- the meal moments and the suppliers' times. Safe to run again.

set local search_path to wedding_space, public;

-- 3.13: when a supplier is at the venue ---------------------------------------------------------
alter table couple_suppliers add column if not exists present_from text not null default '';
alter table couple_suppliers add column if not exists present_until text not null default '';

-- 3.12 / 3.13: a row that comes from elsewhere knows its source (one row per source, never two).
alter table runsheet_rows add column if not exists source text;
alter table runsheet_rows add column if not exists source_id uuid;
alter table runsheet_rows drop constraint if exists runsheet_rows_source_check;
alter table runsheet_rows add constraint runsheet_rows_source_check
  check (source is null or (source in ('meal', 'supplier_from', 'supplier_until') and source_id is not null));
create unique index if not exists runsheet_rows_source_idx on runsheet_rows (couple_id, source, source_id) where source is not null;

-- 3.1: double "Opstelling" and "Meeneemlijst" ---------------------------------------------------
-- Couples from before 0010 had them as plain list tabs. 0010 turned the empty ones into the new
-- tabs, but next to a list that had rows it added a second tab with the same name.

-- The new tab first, should a couple only have the old one.
insert into runsheet_tabs (couple_id, title, kind, position)
select distinct on (t.couple_id, t.title) t.couple_id, t.title, case t.title when 'Opstelling' then 'seating' else 'packing' end, t.position
  from runsheet_tabs t
 where t.kind = 'list' and t.title in ('Opstelling', 'Meeneemlijst')
   and not exists (select 1 from runsheet_tabs x where x.couple_id = t.couple_id
                    and x.kind = case t.title when 'Opstelling' then 'seating' else 'packing' end);

-- Meeneemlijst rows become items of "Inpaklijst bruiloft" (Meer info in brackets, Wie stays).
insert into packing_items (couple_id, list_kind, what, who, packed, is_default, created_by, position, created_at)
select r.couple_id, 'wedding',
       left(case when trim(r.what) <> '' and trim(r.info) <> '' then trim(r.what) || ' (' || trim(r.info) || ')'
                 else coalesce(nullif(trim(r.what), ''), trim(r.info)) end, 1000),
       left(case when cardinality(r.people) > 0 then array_to_string(r.people, ', ') else r.who end, 120),
       false, false, r.created_by, 1000 + r.position, r.created_at
  from runsheet_rows r join runsheet_tabs t on t.id = r.tab_id
 where t.kind = 'list' and t.title = 'Meeneemlijst' and (trim(r.what) <> '' or trim(r.info) <> '');

-- Opstelling rows move to the new tab, where they show as notes under the seating plan.
update runsheet_rows r set tab_id = n.id
  from runsheet_tabs t, runsheet_tabs n
 where r.tab_id = t.id and t.kind = 'list' and t.title = 'Opstelling'
   and n.couple_id = t.couple_id and n.kind = 'seating'
   and n.id = (select x.id from runsheet_tabs x where x.couple_id = t.couple_id and x.kind = 'seating' order by x.position, x.id limit 1);

-- Now the old tabs can go (the Meeneemlijst rows were copied above, the Opstelling rows moved).
delete from runsheet_tabs t
 where t.kind = 'list' and t.title in ('Opstelling', 'Meeneemlijst')
   and exists (select 1 from runsheet_tabs x where x.couple_id = t.couple_id
                and x.kind = case t.title when 'Opstelling' then 'seating' else 'packing' end);

-- 3.2: Dagplanning, Gastenlijst, (Leveranciers), Groepsfoto's, (Eten & allergieën), Stylingplan,
-- Opstelling, Meeneemlijst; own tabs after these, in their own order. Only the first tab of a kind
-- takes the fixed place.
with firsts as (
  select distinct on (couple_id, kind) id, kind from runsheet_tabs order by couple_id, kind, position, id
), ranked as (
  select t.id, row_number() over (
           partition by t.couple_id
           order by coalesce(case when f.id is not null then array_position(array['schedule', 'guests', 'photos', 'styling', 'seating', 'packing'], t.kind) end, 99),
                    t.position, t.id) as pos
    from runsheet_tabs t left join firsts f on f.id = t.id
)
update runsheet_tabs t set position = ranked.pos from ranked where ranked.id = t.id and t.position is distinct from ranked.pos;
