-- Feedback Sabine, "Aanraders van Estasi" (punten 2.1 tot en met 2.4):
-- more details per recommendation (region, contact person, Instagram, more
-- information, work area, price indication, availability), an order within
-- its category and updated_at. "Zichtbaar" is the existing archived column
-- (archived = hidden), which the file route already respects.

set local search_path to wedding_space, public;

alter table recommendations add column if not exists region text not null default '';
alter table recommendations add column if not exists contact_person text not null default '';
alter table recommendations add column if not exists instagram text not null default '';
alter table recommendations add column if not exists description text not null default '';
alter table recommendations add column if not exists work_area text not null default '';
alter table recommendations add column if not exists price_indication text not null default '';
alter table recommendations add column if not exists availability text not null default '';
alter table recommendations add column if not exists updated_at timestamptz not null default now();

-- position was one list over all categories; from now on it counts within the
-- category. Renumber once, keeping the current order.
update recommendations r set position = n.rn
  from (select id, row_number() over (partition by category_id order by position, name) as rn from recommendations) n
 where n.id = r.id and r.position <> n.rn;
