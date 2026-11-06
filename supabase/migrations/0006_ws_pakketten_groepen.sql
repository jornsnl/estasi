-- Feedback Sabine, fundering:
-- * a couple can have several packages (Weddingplanner, Ceremoniemeester,
--   Openingsdans); what they see depends on the kind of each package
-- * guest groups (Daggasten, Avondgasten and the couple's own groups) that
--   RSVP forms, the guest list, the seating and the meals all share

set local search_path to wedding_space, public;

-- Kind of package: wp = Weddingplanner, cm = Ceremoniemeester, od = Openingsdans.
alter table packages add column if not exists kind text not null default 'wp';
alter table packages drop constraint if exists packages_kind_check;
alter table packages add constraint packages_kind_check check (kind in ('wp', 'cm', 'od'));
update packages set kind = 'od' where name ilike 'openingsdans%';
update packages set kind = 'cm' where name ilike '%ceremoniemeester%';

create table if not exists couple_packages (
  couple_id uuid not null references couples (id) on delete cascade,
  package_id uuid not null references packages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (couple_id, package_id)
);

insert into couple_packages (couple_id, package_id)
select id, package_id from couples where package_id is not null
on conflict do nothing;

-- Guest groups --------------------------------------------------------------------------
create table if not exists guest_groups (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  name text not null,
  -- day and evening are the two standard groups; custom ones the couple adds.
  kind text not null default 'custom' check (kind in ('day', 'evening', 'custom')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists guest_groups_couple_idx on guest_groups (couple_id, position);

insert into guest_groups (couple_id, name, kind, position)
select c.id, g.name, g.kind, g.position
from couples c
cross join (values ('Daggasten', 'day', 1), ('Avondgasten', 'evening', 2)) as g (name, kind, position)
where not exists (select 1 from guest_groups x where x.couple_id = c.id);

alter table rsvp_forms add column if not exists group_id uuid references guest_groups (id) on delete set null;
alter table guests add column if not exists group_id uuid references guest_groups (id) on delete set null;

-- Existing forms: "avond" in the name means evening guests, anything else day guests.
update rsvp_forms f set group_id = g.id
  from guest_groups g
 where g.couple_id = f.couple_id and f.group_id is null
   and g.kind = case when f.name ilike '%avond%' then 'evening' else 'day' end;
update guests x set group_id = f.group_id from rsvp_forms f where f.id = x.form_id and x.group_id is null;
update guests x set group_id = g.id from guest_groups g
 where x.group_id is null and g.couple_id = x.couple_id and g.kind = 'day';

alter table couple_packages enable row level security;
alter table guest_groups enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
