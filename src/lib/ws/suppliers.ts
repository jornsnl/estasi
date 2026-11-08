import "server-only";
import { one, query } from "@/lib/ws/db";
import { adminNotifyEmail, appUrl, sendMail } from "@/lib/ws/mail";
import { coupleName } from "@/lib/ws/format";
import type { Couple, CoupleSupplier, SupplierStatus } from "@/lib/ws/types";

export const SUPPLIER_STATUS: Record<SupplierStatus, string> = {
  tbd: "Nog te bepalen",
  favorite: "Huidige favoriet",
  talking: "In gesprek",
  booked: "Staat vast",
  not_needed: "Niet nodig",
};

/** The button "Bekijk Estasi aanraders" only shows while there is still something to choose. */
export const SHOWS_RECOMMENDATIONS: SupplierStatus[] = ["tbd", "favorite", "talking"];

export const isSupplierStatus = (value: string): value is SupplierStatus => value in SUPPLIER_STATUS;

/** Standard categories plus the couple's own ones. */
export async function categoriesFor(coupleId: string) {
  return query<{ id: string; name: string; couple_id: string | null }>(
    `select id, name, couple_id from supplier_categories
      where not archived and (couple_id is null or couple_id = $1)
      order by couple_id nulls first, position, name`,
    [coupleId],
  );
}

/**
 * Every category with at least one row, so each category is always on the
 * list (and every row has an id to save to). Categories without a supplier
 * get an empty row here.
 */
export async function suppliersFor(coupleId: string) {
  await query(
    `insert into couple_suppliers (couple_id, category_id)
     select $1, c.id from supplier_categories c
      where not c.archived and (c.couple_id is null or c.couple_id = $1)
        and not exists (select 1 from couple_suppliers s where s.couple_id = $1 and s.category_id = c.id)`,
    [coupleId],
  );
  return query<CoupleSupplier & { documents: number; category_couple_id: string | null }>(
    `select s.id, c.id as category_id, c.name as category_name, c.couple_id as category_couple_id, s.status,
            s.name, s.contact_person, s.phone, s.email, s.website, s.address, s.notes, s.recommendation_id,
            (select count(*)::int from supplier_documents d where d.supplier_id = s.id) as documents
       from couple_suppliers s
       join supplier_categories c on c.id = s.category_id
      where s.couple_id = $1 and not c.archived
      order by c.couple_id nulls first, c.position, c.name, s.position, s.created_at`,
    [coupleId],
  );
}

// Favourites --------------------------------------------------------------------------------------

const BUNDLE_MINUTES = 5;
const timers = globalThis as unknown as { __wsFavoriteTimer?: ReturnType<typeof setTimeout> };

/**
 * A couple marked a recommendation as favourite. Sabine sees it on her
 * dashboard at once; the mail waits a few minutes so several favourites
 * chosen shortly after each other arrive in one mail.
 */
export async function recordFavorite(couple: Couple, recommendationId: string) {
  await query("insert into favorite_events (couple_id, recommendation_id) values ($1, $2)", [couple.id, recommendationId]);
  // Mails that should have gone already (for instance after a restart) go now.
  await flushFavoriteMails(BUNDLE_MINUTES).catch((err) => console.error(`[favorieten] ${(err as Error).message}`));
  if (!timers.__wsFavoriteTimer) {
    timers.__wsFavoriteTimer = setTimeout(() => {
      timers.__wsFavoriteTimer = undefined;
      flushFavoriteMails(0).catch((err) => console.error(`[favorieten] ${(err as Error).message}`));
    }, BUNDLE_MINUTES * 60_000 + 5_000);
    timers.__wsFavoriteTimer.unref?.();
  }
}

/** Sends one mail per couple with every favourite not mailed yet that is older than the given minutes. */
export async function flushFavoriteMails(olderThanMinutes: number) {
  const due = await query<{ couple_id: string }>(
    `select distinct couple_id from favorite_events
      where mailed_at is null and created_at <= now() - make_interval(mins => $1)`,
    [olderThanMinutes],
  );
  for (const { couple_id } of due) {
    const events = await query<{ id: string; rec: string | null; category: string | null }>(
      `update favorite_events e set mailed_at = now()
         from favorite_events x
         left join recommendations r on r.id = x.recommendation_id
         left join supplier_categories c on c.id = r.category_id
        where e.id = x.id and x.couple_id = $1 and x.mailed_at is null
        returning e.id, r.name as rec, c.name as category`,
      [couple_id],
    );
    const couple = await one<Couple>("select * from couples where id = $1", [couple_id]);
    if (!couple || events.length === 0) continue;
    const list = events.map((e) => `• ${e.rec ?? "(verwijderde aanrader)"}${e.category ? ` (${e.category})` : ""}`).join("\n");
    await sendMail({
      to: adminNotifyEmail(),
      subject: `${coupleName(couple)}: ${events.length === 1 ? "nieuwe favoriet" : `${events.length} nieuwe favorieten`}`,
      text: `${coupleName(couple)} ${events.length === 1 ? "heeft een nieuwe favoriet" : "hebben nieuwe favorieten"} gekozen bij de aanraders:\n\n${list}\n\nBekijken: ${appUrl()}/k/${couple.id}/leveranciers`,
    });
  }
}

/** Visible recommendations per category id (for the bordeaux bar on "Jullie leveranciers"). */
export async function visibleRecommendationCounts(): Promise<Record<string, number>> {
  const rows = await query<{ category_id: string; n: number }>(
    "select category_id, count(*)::int as n from recommendations where not archived group by category_id",
  );
  return Object.fromEntries(rows.map((r) => [r.category_id, r.n]));
}
