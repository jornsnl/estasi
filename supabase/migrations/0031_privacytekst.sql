-- Academy 16: the privacy text students see on their profile, set by
-- Sabine under Instellingen. Empty means the built-in default text.

alter table public.settings add column if not exists privacy_text text not null default '';
