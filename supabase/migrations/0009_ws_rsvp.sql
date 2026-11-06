-- Feedback Sabine, Gastenlijst & RSVP (punten 19 en 28 tot en met 34):
-- standard questions plus a question builder, confirmation mails per form,
-- guest groups with one or more forms each, a header photo per form,
-- manually added guests, the invitation list, and the guest list on the day.

set local search_path to wedding_space, public;

-- Forms -----------------------------------------------------------------------------------------
alter table rsvp_forms add column if not exists header_file_id uuid references files (id) on delete set null;
-- Vertical position of the header photo inside its frame, 0 (top) to 100 (bottom).
alter table rsvp_forms add column if not exists header_position integer not null default 50;
alter table rsvp_forms add column if not exists ask_dresscode boolean not null default false;
alter table rsvp_forms add column if not exists dresscode_note text not null default '';
alter table rsvp_forms add column if not exists confirmation_subject text not null default '';
alter table rsvp_forms add column if not exists decline_subject text not null default '';
update rsvp_forms set ask_dresscode = true where dresscode <> '';

-- Questions: more kinds, help text, required, choices and "only show if" -----------------------------
alter table rsvp_questions drop constraint if exists rsvp_questions_kind_check;
update rsvp_questions set kind = 'short' where kind = 'text';
alter table rsvp_questions add constraint rsvp_questions_kind_check
  check (kind in ('short', 'long', 'single', 'multi', 'yesno', 'number'));
alter table rsvp_questions add column if not exists help text not null default '';
alter table rsvp_questions add column if not exists required boolean not null default false;
alter table rsvp_questions add column if not exists options jsonb not null default '[]'::jsonb;
alter table rsvp_questions add column if not exists max_choices integer;
alter table rsvp_questions add column if not exists show_if_question_id uuid references rsvp_questions (id) on delete set null;
alter table rsvp_questions add column if not exists show_if_value text not null default '';

-- Responses ---------------------------------------------------------------------------------------
alter table rsvp_responses add column if not exists party_count integer not null default 1;
alter table rsvp_responses add column if not exists relations jsonb not null default '[]'::jsonb;
-- "Nee, ik ontvang graag meer informatie" over the dress code: an action point for Sabine until handled.
alter table rsvp_responses add column if not exists info_handled_at timestamptz;

-- Guests ------------------------------------------------------------------------------------------
alter table guests add column if not exists manual boolean not null default false;
alter table guests add column if not exists checked_in boolean not null default false;
alter table guests add column if not exists important boolean not null default false;
-- "Zus Estelle": a finer relation for the day, without changing what the guest filled in.
alter table guests add column if not exists relation_note text not null default '';
update guests set manual = true where response_id is null;

-- Invitation list (one row per household) -----------------------------------------------------------
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  names text not null,
  party_size integer not null default 1 check (party_size between 1 and 50),
  group_id uuid references guest_groups (id) on delete set null,
  address text not null default '',
  email text not null default '',
  send_via text not null default 'post' check (send_via in ('post', 'mail')),
  sent boolean not null default false,
  -- Set when someone confirmed by hand that a response belongs to this household.
  response_id uuid references rsvp_responses (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists invitations_couple_idx on invitations (couple_id, position);

-- Every standard group gets a form, as new couples do.
insert into rsvp_forms (couple_id, slug, name, group_id, ask_diet, ask_part_of_day, position)
select g.couple_id, substr(md5(random()::text || g.id::text), 1, 14), g.name, g.id, true, g.kind = 'day', g.position
  from guest_groups g
 where g.kind in ('day', 'evening')
   and not exists (select 1 from rsvp_forms f where f.group_id = g.id);

alter table invitations enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
