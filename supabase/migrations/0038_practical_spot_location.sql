-- Feedback Sabine: the weddings of the practical spots (Instellingen) in a compact table with the
-- columns Bruidspaar, Trouwdatum, Locatie, Gekoppelde cursist and Notitie (intern). The location
-- is new; the rest was already there (0035).
alter table public.practical_spots add column if not exists location text not null default '';
