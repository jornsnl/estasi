-- Feedback Sabine, opstelling (punten 3.4 tot en met 3.7): own styling objects
-- and ceremony elements on the plan, objects on a chair, and the number of
-- chairs per row and per side of a ceremony with an aisle.

set local search_path to wedding_space, public;

-- Objects on the plan: a styling item from the styling plan (as before), an own
-- styling object with a name, or a ceremony element (BABS, music instrument,
-- signing table, own block).
alter table seating_blocks alter column styling_item_id drop not null;
alter table seating_blocks add column if not exists kind text not null default 'styling';
alter table seating_blocks add column if not exists name text not null default '';
alter table seating_blocks add column if not exists created_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seating_blocks_kind_check') then
    alter table seating_blocks add constraint seating_blocks_kind_check
      check (kind in ('styling', 'babs', 'music', 'signing', 'custom'));
  end if;
end $$;

-- A chair can hold an object instead of a guest or a typed name.
alter table seating_seats add column if not exists object_id uuid references seating_blocks (id) on delete cascade;
create unique index if not exists seating_seats_object_idx on seating_seats (object_id) where object_id is not null;

-- Ceremony with an aisle: chairs per row, left and right, e.g. [{"left":6,"right":5}, ...].
alter table seating_layouts add column if not exists row_seats jsonb not null default '[]';
update seating_layouts l
   set row_seats = (select jsonb_agg(jsonb_build_object('left', s.n, 'right', s.n))
                      from (select l.seats_per_row as n from generate_series(1, l.rows)) s)
 where l.kind = 'ceremony' and l.row_seats = '[]'::jsonb;
