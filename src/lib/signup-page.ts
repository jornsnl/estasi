import "server-only";
import { one, query } from "@/lib/db";

/**
 * What Sabine fills in for the public sign up page of the Academy (/inschrijven), feedback Sabine:
 * the logo, her photo at "Je opleider" and a review with two photos (migration 0035).
 */
export interface SignupPage {
  logo_file_id: string | null;
  trainer_photo_file_id: string | null;
  review_text: string;
  review_name: string;
  review_photo1_file_id: string | null;
  review_photo2_file_id: string | null;
}

export const SIGNUP_IMAGE_FIELDS = ["logo_file_id", "trainer_photo_file_id", "review_photo1_file_id", "review_photo2_file_id"] as const;
export type SignupImageField = (typeof SIGNUP_IMAGE_FIELDS)[number];

const EMPTY: SignupPage = {
  logo_file_id: null,
  trainer_photo_file_id: null,
  review_text: "",
  review_name: "",
  review_photo1_file_id: null,
  review_photo2_file_id: null,
};

export async function getSignupPage(): Promise<SignupPage> {
  const row = await one<SignupPage>(
    "select logo_file_id, trainer_photo_file_id, review_text, review_name, review_photo1_file_id, review_photo2_file_id from public.signup_page where id",
  );
  return row ?? EMPTY;
}

export async function saveSignupPage(page: SignupPage): Promise<void> {
  await query(
    `insert into public.signup_page (id, logo_file_id, trainer_photo_file_id, review_text, review_name, review_photo1_file_id, review_photo2_file_id, updated_at)
     values (true, $1, $2, $3, $4, $5, $6, now())
     on conflict (id) do update set logo_file_id = $1, trainer_photo_file_id = $2, review_text = $3, review_name = $4,
                                    review_photo1_file_id = $5, review_photo2_file_id = $6, updated_at = now()`,
    [page.logo_file_id, page.trainer_photo_file_id, page.review_text, page.review_name, page.review_photo1_file_id, page.review_photo2_file_id],
  );
}

/** True when the file is one of the pictures on the page, so the public may see it. */
export async function isSignupImage(fileId: string): Promise<boolean> {
  const page = await getSignupPage();
  return SIGNUP_IMAGE_FIELDS.some((f) => page[f] === fileId);
}
