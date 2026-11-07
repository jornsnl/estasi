import "server-only";
import { query } from "./db";
import type { BudgetItem } from "./types";

export const ESTASI = "Estasi Weddings";

export type CostLine = BudgetItem & { kind: "category" | "own" | "extra" | "package"; supplier: string; supplier_category_id: string | null; package_id: string | null };

/**
 * Brings the automatic lines up to date and returns every line:
 * one per supplier category (hidden when the couple marked it "Niet nodig"),
 * the couple's own budget parts and extra costs, and one line per Estasi
 * package with the package price.
 */
export async function costLines(coupleId: string): Promise<CostLine[]> {
  await query(
    `insert into budget_items (couple_id, kind, supplier_category_id, name, category, position)
     select $1, 'category', c.id, c.name, c.name, 100 + c.position
       from supplier_categories c
      where not c.archived and (c.couple_id is null or c.couple_id = $1)
     on conflict do nothing`,
    [coupleId],
  );
  // Category lines follow a renamed category.
  await query(
    `update budget_items b set name = c.name, category = c.name from supplier_categories c
      where b.couple_id = $1 and b.kind = 'category' and c.id = b.supplier_category_id and (b.name <> c.name or b.category <> c.name)`,
    [coupleId],
  );
  // Estasi packages: added, removed and priced along with the couple's packages.
  await query(
    `delete from budget_items b where b.couple_id = $1 and b.kind = 'package'
        and not exists (select 1 from couple_packages cp where cp.couple_id = $1 and cp.package_id = b.package_id)`,
    [coupleId],
  );
  await query(
    `insert into budget_items (couple_id, kind, package_id, name, category, supplier, budget_cents, actual_cents, position)
     select $1, 'package', p.id, 'Pakket Estasi: ' || p.name || case when p.variant <> '' then ' (' || p.variant || ')' else '' end,
            $2, $2, p.price_cents, p.price_cents, p.position
       from couple_packages cp join packages p on p.id = cp.package_id where cp.couple_id = $1
     on conflict do nothing`,
    [coupleId, ESTASI],
  );
  await query(
    `update budget_items b set budget_cents = p.price_cents, actual_cents = p.price_cents,
            name = 'Pakket Estasi: ' || p.name || case when p.variant <> '' then ' (' || p.variant || ')' else '' end
       from packages p
      where b.couple_id = $1 and b.kind = 'package' and p.id = b.package_id
        and (b.budget_cents <> p.price_cents or b.actual_cents is distinct from p.price_cents)`,
    [coupleId],
  );
  return query<CostLine>(
    `select b.*,
            case when b.kind = 'category'
                 then coalesce(nullif(b.supplier, ''), (select string_agg(s.name, ', ') from couple_suppliers s
                                                        where s.couple_id = b.couple_id and s.category_id = b.supplier_category_id
                                                          and s.name <> '' and s.status <> 'not_needed'), '')
                 else b.supplier end as supplier
       from budget_items b
       left join supplier_categories c on c.id = b.supplier_category_id
      where b.couple_id = $1
        and not (b.kind = 'category' and (c.archived or exists (
              select 1 from couple_suppliers s where s.couple_id = b.couple_id and s.category_id = b.supplier_category_id
            ) and not exists (
              select 1 from couple_suppliers s where s.couple_id = b.couple_id and s.category_id = b.supplier_category_id and s.status <> 'not_needed'
            )))
      order by case b.kind when 'package' then 0 when 'category' then 1 when 'own' then 2 else 3 end, b.position, b.created_at`,
    [coupleId],
  );
}
