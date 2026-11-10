-- Feedback Sabine (november, derde ronde). New tables and columns only; existing data stays as it is.

-- 1. Praktijkplekken (Instellingen): the weddings where students of package B walk along, with the
--    date, the names of the couple and the student linked to it. Read and written by the server only.
create table if not exists public.practical_spots (
  id uuid primary key default gen_random_uuid(),
  wedding_date date not null,
  couple_names text not null,
  student_user_id uuid references public.users (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists practical_spots_date_idx on public.practical_spots (wedding_date);
create index if not exists practical_spots_student_idx on public.practical_spots (student_user_id);

alter table public.practical_spots enable row level security;
revoke all on public.practical_spots from anon, authenticated;

-- 2. Salespipeline: interest "Ceremoniemeester" and source "Meta Ads".
alter table public.pipeline_leads drop constraint if exists pipeline_leads_interest_check;
alter table public.pipeline_leads add constraint pipeline_leads_interest_check
  check (interest in ('weddingplanning', 'ceremoniemeester', 'openingsdans', 'academy', 'overig'));
alter table public.pipeline_leads drop constraint if exists pipeline_leads_source_check;
alter table public.pipeline_leads add constraint pipeline_leads_source_check
  check (source in ('website', 'instagram', 'meta_ads', 'aanbeveling', 'beurs', 'mail', 'handmatig', 'overig'));

-- 3. Price and payment per couple (Your Wedding Space): the agreed price, paid at once or in two
--    halves, when each part was paid, and the date of the sale for the revenue overview (Pipeline, Omzet).
alter table wedding_space.couples add column if not exists agreed_price_cents integer check (agreed_price_cents is null or agreed_price_cents >= 0);
alter table wedding_space.couples add column if not exists payment_plan text not null default 'once' check (payment_plan in ('once', 'two'));
alter table wedding_space.couples add column if not exists paid_first_at timestamptz;
alter table wedding_space.couples add column if not exists paid_second_at timestamptz;
alter table wedding_space.couples add column if not exists sold_on date;
update wedding_space.couples set sold_on = (created_at at time zone 'Europe/Amsterdam')::date where sold_on is null;
alter table wedding_space.couples alter column sold_on set default current_date;
alter table wedding_space.couples alter column sold_on set not null;

-- 4. The public sign up page of the Academy (/inschrijven): logo, photo of Sabine and a review with
--    two photos, filled in by Sabine. One row. The files are Academy uploads (public.files); the page
--    serves only the files named here (src/app/api/inschrijven/foto/[id]).
create table if not exists public.signup_page (
  id boolean primary key default true check (id),
  logo_file_id uuid,
  trainer_photo_file_id uuid,
  review_text text not null default '',
  review_name text not null default '',
  review_photo1_file_id uuid,
  review_photo2_file_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.signup_page (id, review_text, review_name)
values (
  true,
  'Sabine heeft mij de kans geboden om een kijkje te nemen in het vak van weddingplanner, en daar ben ik haar ontzettend dankbaar voor 🤩. Ik heb hierdoor niet alleen kunnen zien wat een weddingplanner allemaal doet, maar ook van dichtbij mogen ervaren hoe fijn, betrokken en georganiseerd Sabine te werk gaat.

Alles was tot in de puntjes geregeld voor het bruidspaar en aan alles was gedacht. Het was ontzettend leuk en leerzaam om een dag met haar mee te mogen lopen!',
  ''
)
on conflict (id) do nothing;

alter table public.signup_page enable row level security;
revoke all on public.signup_page from anon, authenticated;
