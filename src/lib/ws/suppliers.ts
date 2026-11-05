import "server-only";
import { query } from "@/lib/ws/db";
import type { CoupleSupplier } from "@/lib/ws/types";

export const SUPPLIER_STATUS = { open: "Nog te bepalen", talking: "In gesprek", booked: "Geregeld" } as const;

/** Every category is always shown, also without a supplier yet (h9.13). */
export async function suppliersFor(coupleId: string) {
  return query<CoupleSupplier & { documents: number }>(
    `select s.id, c.id as category_id, c.name as category_name, coalesce(s.status, 'open') as status,
            coalesce(s.name, '') as name, coalesce(s.contact_person, '') as contact_person, coalesce(s.phone, '') as phone,
            coalesce(s.email, '') as email, coalesce(s.website, '') as website, coalesce(s.address, '') as address,
            coalesce(s.notes, '') as notes,
            (select count(*)::int from supplier_documents d where d.supplier_id = s.id) as documents
       from supplier_categories c
       left join couple_suppliers s on s.category_id = c.id and s.couple_id = $1
      where not c.archived
      order by c.position, c.name`,
    [coupleId],
  );
}
