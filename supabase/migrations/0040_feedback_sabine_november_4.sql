-- Feedback Sabine (november, vierde ronde: 27 punten). New tables and columns only; existing data stays.

-- 22. Afspraken met de locatie: per wedding venue (one or more) what the venue was promised and when,
--     filled in by Sabine and the couple on the page Afspraken. Free text, because a venue says
--     "twee weken van tevoren" as often as a date.
create table if not exists wedding_space.venue_agreements (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references wedding_space.couples (id) on delete cascade,
  venue text not null default '',
  times_due text not null default '',
  guest_list_due text not null default '',
  diet_due text not null default '',
  notes text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists venue_agreements_couple_idx on wedding_space.venue_agreements (couple_id, position);
alter table wedding_space.venue_agreements enable row level security;
revoke all on wedding_space.venue_agreements from anon, authenticated;

-- 6. Taken, "Ingeleverde opdrachten om samen te vatten": only Thema & Styling (the assignment that is
--    the basis of the styling plan), never Budgetplanning, and Sabine ticks one off once she made the
--    summary. One that already had a summary counts as done.
alter table wedding_space.assignments add column if not exists summary_done_at timestamptz;
update wedding_space.assignments set summary_done_at = coalesce(ai_summary_at, now())
 where summary_done_at is null and coalesce(ai_summary, '') <> '';

-- 5. Requests for an opening dance package now have their own place on Taken. The task that each
--    request used to put in the Sabine column is no longer made; the open ones made that way are
--    closed, the request itself stays open on Taken until she marks it handled.
update wedding_space.tasks set done_at = now()
 where lane = 'sabine' and done_at is null and title like 'Openingsdans-aanvraag opvolgen:%';

-- 7. Agenda: Sabine's own appointments, without a couple ("Sabine" in Afspraak toevoegen). Shown in
--    her agenda and calendar in the green house colour.
create table if not exists wedding_space.own_appointments (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'appointment' check (kind in ('appointment', 'deadline')),
  title text not null,
  on_date date not null,
  at_time text not null default '',
  notes text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists own_appointments_date_idx on wedding_space.own_appointments (on_date);
alter table wedding_space.own_appointments enable row level security;
revoke all on wedding_space.own_appointments from anon, authenticated;

-- 11. Uitnodigingslijst: a name for every person of a household, also when it is not a child. The
--     children keep their own rows (invitation_children); these are the names of the adults.
alter table wedding_space.invitations add column if not exists people text[] not null default '{}';

-- 19. Opdrachten as tiles with a photo, like Aanraders: Sabine sets a photo per standard assignment
--     (Beheer, Opdrachten); every couple's copy shows the photo of its template.
alter table wedding_space.assignment_templates add column if not exists photo_file_id uuid references wedding_space.files (id) on delete set null;

-- 21. Leveranciers, "Eet mee": a supplier that eats along gets a row on the meal list (Eten &
--     allergieën), where the moments are ticked; the counts in the day planning follow. The row
--     goes when the supplier goes or the box is unticked.
alter table wedding_space.meal_rows add column if not exists supplier_id uuid references wedding_space.couple_suppliers (id) on delete cascade;
create unique index if not exists meal_rows_supplier_idx on wedding_space.meal_rows (supplier_id) where supplier_id is not null;
