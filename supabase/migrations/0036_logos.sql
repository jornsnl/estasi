-- Feedback Sabine: her own logos instead of the bordeaux E, uploaded in Instellingen, Logo's.
-- One row. The files are Academy uploads (public.files), SVG, png or jpg; only the files named
-- here are served publicly (src/app/api/logo/[kind]/[variant]), as mail header and app icon.
--   academy_file_id: Future Weddings Academy, for students (mails and app icon of the Academy)
--   estasi_file_id:  Estasi Weddings, for couples (mails and app icon of Your Wedding Space)
--   app_file_id:     the icon of the beheer app on Sabine's own home screen
create table if not exists public.brand_logos (
  id boolean primary key default true check (id),
  academy_file_id uuid,
  estasi_file_id uuid,
  app_file_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.brand_logos (id) values (true) on conflict (id) do nothing;

alter table public.brand_logos enable row level security;
revoke all on public.brand_logos from anon, authenticated;
