-- Feedback Sabine, begroting en kostenoverzicht (punten 37 en 38).
-- One set of cost lines for both the budget (in the assignment) and the cost
-- overview:
--   category: one per supplier category (filled in automatically)
--   own:      a budget part the couple adds (e.g. Trouwkaarten)
--   extra:    an extra cost from the form on the cost overview
--   package:  each chosen Estasi package, amount = package price, Sabine only

set local search_path to wedding_space, public;

alter table couples add column if not exists total_budget_cents integer check (total_budget_cents >= 0);

alter table budget_items add column if not exists kind text not null default 'extra';
alter table budget_items drop constraint if exists budget_items_kind_check;
alter table budget_items add constraint budget_items_kind_check check (kind in ('category', 'own', 'extra', 'package'));
alter table budget_items add column if not exists supplier_category_id uuid references supplier_categories (id) on delete cascade;
alter table budget_items add column if not exists package_id uuid references packages (id) on delete cascade;
alter table budget_items add column if not exists supplier text not null default '';
-- Existing lines carry a budget: they are the couple's own budget parts.
update budget_items set kind = 'own' where kind = 'extra' and budget_cents > 0;

create unique index if not exists budget_items_category_idx on budget_items (couple_id, supplier_category_id) where kind = 'category';
create unique index if not exists budget_items_package_idx on budget_items (couple_id, package_id) where kind = 'package';

-- The budget table belongs to the assignment "Budgetplanning & prioriteiten".
alter table assignments add column if not exists budget boolean not null default false;
alter table assignment_templates add column if not exists budget boolean not null default false;
update assignment_templates set budget = true where title = 'Budgetplanning & prioriteiten';
update assignments a set budget = true from assignment_templates t where t.id = a.template_id and t.budget;
update assignments set budget = true where title = 'Budgetplanning & prioriteiten';
