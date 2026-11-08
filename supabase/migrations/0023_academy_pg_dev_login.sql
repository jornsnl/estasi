-- The Academy reads and writes its tables straight through Postgres (pg with
-- DATABASE_URL), like Your Wedding Space. Two additions for local development
-- without Supabase. Both are unused in production.

-- Development login (src/lib/auth/dev-auth.ts). Only used when SUPABASE_URL is
-- missing and NODE_ENV is not "production"; in production the app refuses it
-- and accounts sign in through Supabase Auth. Stays empty there.
create table if not exists public.dev_passwords (
  user_id uuid primary key references public.users (id) on delete cascade,
  password_hash text,
  -- One-time activation or reset link (/activeren/<token>).
  setup_token text unique,
  setup_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.dev_passwords enable row level security;
revoke all on public.dev_passwords from anon, authenticated;

-- Uploads without Supabase Storage (local development) keep their bytes in
-- the row. In production this stays null and the bytes are in the bucket
-- "academy", as before.
alter table public.files add column if not exists data bytea;
