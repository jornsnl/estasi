-- Feedback Sabine, styling (punt 7.2): an optional name per colour of the
-- palette. The palette itself stays in styling_plans.colors (hex codes, in
-- order); the names are kept next to it per hex code, so nothing changes for
-- existing palettes.

set local search_path to wedding_space, public;

alter table styling_plans add column if not exists color_names jsonb not null default '{}'::jsonb;
