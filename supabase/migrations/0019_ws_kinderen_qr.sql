-- Feedback Sabine, Gasten (punten 5.1 en 5.2): children per invitation, each a
-- record of its own, and an RSVP link that never changes.

set local search_path to wedding_space, public;

-- Children on the invitation list ---------------------------------------------------------------
-- One row per child of a household. They count in the household's number of
-- people and get the type (day or evening) of the invitation.
create table if not exists invitation_children (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  invitation_id uuid not null references invitations (id) on delete cascade,
  name text not null default '',
  is_kid boolean not null default true,
  -- The guest from the RSVP this child turned out to be (the household signed it up itself).
  linked_guest_id uuid references guests (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists invitation_children_invitation_idx on invitation_children (invitation_id, position);
create index if not exists invitation_children_couple_idx on invitation_children (couple_id);

-- Once the household has signed up, a child the RSVP did not mention becomes a
-- guest of its own (to count, to seat, for the meals); it goes when the child goes.
alter table guests add column if not exists invitation_child_id uuid references invitation_children (id) on delete cascade;
create unique index if not exists guests_invitation_child_idx on guests (invitation_child_id) where invitation_child_id is not null;

alter table invitation_children enable row level security;

-- The RSVP link (and so the QR code) never changes -----------------------------------------------
create or replace function rsvp_forms_keep_slug() returns trigger language plpgsql as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'De link van een RSVP-formulier verandert nooit';
  end if;
  return new;
end $$;
drop trigger if exists rsvp_forms_keep_slug on rsvp_forms;
create trigger rsvp_forms_keep_slug before update of slug on rsvp_forms
  for each row execute function rsvp_forms_keep_slug();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
