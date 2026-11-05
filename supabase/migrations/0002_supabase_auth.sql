-- Wedding Plan Academy: Supabase Auth and Storage.
-- Run after 0001_init.sql. Safe to run more than once.
--
-- Passwords, sessions, MFA and the invite and reset links live in Supabase
-- Auth (auth.users). public.users only keeps the academy side of the account.

-- When the account got its first password (invite accepted).
alter table public.users add column if not exists activated_at timestamptz;

-- E-mail addresses are stored lower case; enforce it so lookups stay exact.
update public.users set email = lower(email) where email <> lower(email);
alter table public.users drop constraint if exists users_email_lower;
alter table public.users add constraint users_email_lower check (email = lower(email));

-- Private bucket for uploads (assignments, feedback attachments, course
-- material, profile photos). Only the server reads it, with the secret key,
-- after checking who is asking; there are no storage policies on purpose.
insert into storage.buckets (id, name, public, file_size_limit)
values ('academy', 'academy', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- The app talks to these tables from the server only (secret key). Close the
-- public Data API for them completely; row level security from 0001 stays on
-- as a second lock.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Lookups the app does often.
create index if not exists lessons_module_idx on public.lessons (module_id, position);
create index if not exists answers_lesson_idx on public.answers (lesson_id);
create index if not exists completions_user_idx on public.lesson_completions (user_id);
create index if not exists files_belongs_idx on public.files (belongs_to);
