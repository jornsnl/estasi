-- A temporary password Sabine sets for a student (next to the invite mail).
-- While this is true the student has to choose an own password after signing in.

alter table public.users add column if not exists must_change_password boolean not null default false;
