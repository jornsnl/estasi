-- Academy: Sabine manages the course herself.
-- * Modules and lessons are either a draft ("concept", only the owner sees it)
--   or published. Everything that exists today stays published.
-- * Per module: for which package it is meant (A, B or both). Today all
--   modules are for both packages.
-- * A published lesson can have a pending draft (title, summary, blocks) that
--   only goes live when the owner publishes it.
-- Additive only: no data changes apart from the defaults on the new columns.

alter table public.modules
  add column if not exists status text not null default 'published',
  add column if not exists packages text not null default 'AB';

alter table public.modules drop constraint if exists modules_status_check;
alter table public.modules add constraint modules_status_check check (status in ('draft', 'published'));
alter table public.modules drop constraint if exists modules_packages_check;
alter table public.modules add constraint modules_packages_check check (packages in ('A', 'B', 'AB'));

alter table public.lessons
  add column if not exists status text not null default 'published',
  -- {"title": ..., "summary": ..., "blocks": [...]}: unpublished changes to a published lesson.
  add column if not exists draft jsonb,
  add column if not exists published_at timestamptz;

alter table public.lessons drop constraint if exists lessons_status_check;
alter table public.lessons add constraint lessons_status_check check (status in ('draft', 'published'));
