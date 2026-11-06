-- Your Wedding Space uploads move out of the database into Supabase Storage.
-- The browser sends a file straight to the private bucket with a one-time
-- signed upload URL that the server hands out after checking who is asking,
-- so files no longer pass through the app server (whose request limits broke
-- the cover photo, package and moodboard uploads).
--
-- Rows that still hold their bytes in files.data keep working; new rows only
-- point at an object in the bucket.

set local search_path to wedding_space, public;

-- Private bucket, read only by the server (secret key) after its own checks;
-- there are no storage policies on purpose. 50 MB is the Supabase Free maximum.
insert into storage.buckets (id, name, public, file_size_limit)
values ('wedding-space', 'wedding-space', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

alter table files alter column data drop not null;
alter table files add column if not exists storage_path text;
-- pending: a signed upload URL was handed out, the file is not linked to anything yet.
alter table files add column if not exists status text not null default 'ready';

alter table files drop constraint if exists files_status_check;
alter table files add constraint files_status_check check (status in ('pending', 'ready'));
alter table files drop constraint if exists files_has_content;
alter table files add constraint files_has_content check (status = 'pending' or data is not null or storage_path is not null);

create unique index if not exists files_storage_path_idx on files (storage_path) where storage_path is not null;
create index if not exists files_pending_idx on files (created_at) where status = 'pending';
