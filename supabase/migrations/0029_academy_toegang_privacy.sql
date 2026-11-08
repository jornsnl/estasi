-- Academy 12 and 16: notices before access ends, and a record of background jobs that run
-- lazily (there is no cron). Only additions. Everything is read and written by the server
-- (src/lib/academy-expiry.ts); row level security is on without policies.

-- One row per notice sent: 30 and 7 days before the end of access. Keyed on the end date, so
-- extending access gives a new end date and the notices can come again for that date.
create table if not exists public.access_notices (
  user_id uuid not null references public.users (id) on delete cascade,
  threshold integer not null check (threshold in (30, 7)),
  ends_at timestamptz not null,
  -- False when the mail could not be sent (no mail configured); the banner in the Academy still shows.
  mailed boolean not null default false,
  sent_at timestamptz not null default now(),
  primary key (user_id, threshold, ends_at)
);

-- When a lazy job last ran (for "at most once an hour", across server processes).
create table if not exists public.academy_jobs (
  name text primary key,
  ran_at timestamptz not null
);

alter table public.access_notices enable row level security;
alter table public.academy_jobs enable row level security;

revoke all on public.access_notices, public.academy_jobs from anon, authenticated;
