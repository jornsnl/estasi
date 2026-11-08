-- Feedback Sabine: mail history (5.5), mail to guests (5.6), the opening dance
-- for couples without it in their package (9.2, 9.3) and the order of the
-- packages (10). Only additions; existing data stays as it is.

set local search_path to wedding_space, public;

-- 5.5 Every mail Wedding Space sends, sent or failed --------------------------------------------

create table if not exists mail_log (
  id uuid primary key default gen_random_uuid(),
  -- The couple the mail is about; null for mails about no couple in particular.
  couple_id uuid references couples (id) on delete cascade,
  guest_id uuid references guests (id) on delete set null,
  response_id uuid references rsvp_responses (id) on delete set null,
  guest_name text not null default '',
  kind text not null default 'overig',
  to_email text not null default '',
  subject text not null default '',
  -- Kept so a failed mail can be sent again; empty for mails with a login link.
  body text not null default '',
  reply_to text not null default '',
  retryable boolean not null default true,
  status text not null check (status in ('sent', 'failed')),
  error text not null default '',
  transport text not null default '',
  attempts integer not null default 1,
  sent_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mail_log_couple_idx on mail_log (couple_id, created_at desc);
create index if not exists mail_log_created_idx on mail_log (created_at desc);
create index if not exists mail_log_response_idx on mail_log (response_id) where response_id is not null;
create index if not exists mail_log_guest_idx on mail_log (guest_id) where guest_id is not null;

alter table mail_log enable row level security;

-- 9.2 / 9.3 The opening dance for couples who do not have it (yet) -------------------------------

-- One video for every couple: an upload or a YouTube/Vimeo link.
alter table settings add column if not exists dance_video_url text not null default '';
alter table settings add column if not exists dance_video_file_id uuid references files (id) on delete set null;

-- The cards are the packages of kind "od" (name, price, description, position): one place to edit.
-- Their contents as a starting point, only where nothing was written yet.
update packages set description = E'Dans tot 1,5 minuut\n2 privélessen\nMuziekmix\nChoreografie op maat\nInspiratie Spotify-playlist'
 where kind = 'od' and description = '' and name ilike '%Just the Two of Us%';
update packages set description = E'Dans tot 2 minuten\n3 privélessen\nMuziekmix\nChoreografie op maat\nInspiratie Spotify-playlist'
 where kind = 'od' and description = '' and name ilike '%Our Song%';
update packages set description = E'Dans tot 3 minuten\n4 privélessen\nGenerale repetitie op locatie\nMuziekmix\nChoreografie op maat\nInspiratie Spotify-playlist'
 where kind = 'od' and description = '' and name ilike '%Showstopper%';

-- The three packages from the feedback, for a database that has none of kind "od".
insert into packages (name, variant, price_cents, meetings, suppliers_enabled, kind, description, position)
select v.name, v.variant, v.price, 0, false, 'od', v.description, (select coalesce(max(position), 0) from packages) + v.n
  from (values
    (1, 'Openingsdans: Just the Two of Us', '2 privélessen', 59500, E'Dans tot 1,5 minuut\n2 privélessen\nMuziekmix\nChoreografie op maat\nInspiratie Spotify-playlist'),
    (2, 'Openingsdans: Our Song', '3 privélessen', 75000, E'Dans tot 2 minuten\n3 privélessen\nMuziekmix\nChoreografie op maat\nInspiratie Spotify-playlist'),
    (3, 'Openingsdans: The Showstopper', '4 privélessen incl. generale repetitie', 95000,
        E'Dans tot 3 minuten\n4 privélessen\nGenerale repetitie op locatie\nMuziekmix\nChoreografie op maat\nInspiratie Spotify-playlist')
  ) as v (n, name, variant, price, description)
 where not exists (select 1 from packages where kind = 'od');

create table if not exists dance_requests (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  -- Null: "Ik weet het nog niet" (or the package was deleted later; the name stays).
  package_id uuid references packages (id) on delete set null,
  package_name text not null default '',
  message text not null default '',
  requested_by_name text not null default '',
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dance_requests_couple_idx on dance_requests (couple_id, created_at desc);

alter table dance_requests enable row level security;

-- 10 Packages: one order, without gaps or ties ---------------------------------------------------

update packages p set position = o.n
  from (select id, row_number() over (order by position, name, id) as n from packages) o
 where o.id = p.id and p.position <> o.n;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wedding_space from anon, authenticated';
  end if;
end $$;
