import "server-only";
import { query } from "./db";

export interface StylingPlace {
  id: string;
  name: string;
  items: { id: string; what: string; who: string; ready: boolean; draft: boolean }[];
  images: { id: string; file_id: string }[];
}

/**
 * The styling plan per place: one source for the page Stylingplan &
 * Moodboard, the run sheet tab and the print. The couple does not see
 * proposals Sabine has not released yet.
 */
export async function stylingPlaces(coupleId: string, isAdmin: boolean): Promise<StylingPlace[]> {
  const [places, items, images] = await Promise.all([
    query<{ id: string; name: string }>("select id, name from styling_places where couple_id = $1 order by position, created_at", [coupleId]),
    query<{ id: string; place_id: string; what: string; who: string; ready: boolean; draft: boolean }>(
      "select id, place_id, what, who, ready, draft from styling_items where couple_id = $1 and (not draft or $2) order by position, created_at",
      [coupleId, isAdmin],
    ),
    query<{ id: string; place_id: string; file_id: string }>("select id, place_id, file_id from styling_place_images where couple_id = $1 order by created_at", [coupleId]),
  ]);
  return places.map((p) => ({
    id: p.id,
    name: p.name,
    items: items.filter((i) => i.place_id === p.id).map((i) => ({ id: i.id, what: i.what, who: i.who, ready: i.ready, draft: i.draft })),
    images: images.filter((i) => i.place_id === p.id).map((i) => ({ id: i.id, file_id: i.file_id })),
  }));
}
