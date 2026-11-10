-- Feedback Sabine: per lead in the Pipeline also the Instagram of the contact and, in her own
-- words, where the contact comes from ("Bruidsbeurs oktober 2026", "Bericht via Instagram").
-- New columns only; the fixed source (website, instagram, beurs ...) stays for the overviews.
alter table public.pipeline_leads add column if not exists instagram text not null default '';
alter table public.pipeline_leads add column if not exists source_note text not null default '';
