"use server";

import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { LIMITS, normaliseUrl } from "@/lib/domain/input";
import { storeUpload, UploadError } from "@/lib/uploads";

const field = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);

export async function saveProfile(formData: FormData) {
  const user = await requireStudent();
  const store = getStore();
  const current = await store.getProfile(user.id);

  // A rejected photo must not throw away the rest of the form: save that, report the photo.
  let photoFileId = current?.photoFileId ?? null;
  let photoError: string | null = null;
  try {
    const photo = await storeUpload(formData.get("photo"), { belongsTo: user.id, uploadedBy: user.id });
    if (photo) {
      if (!photo.mime.startsWith("image/")) throw new UploadError("Kies een afbeelding als profielfoto.");
      photoFileId = photo.id;
    }
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    photoError = err.message;
  }
  if (formData.get("removePhoto") === "on") photoFileId = null;

  const name = field(formData, "name", LIMITS.name);
  if (name && name !== user.name) await store.updateUser(user.id, { name });

  await store.saveProfile({
    userId: user.id,
    phone: field(formData, "phone", LIMITS.phone),
    city: field(formData, "city", LIMITS.city),
    companyName: field(formData, "companyName", LIMITS.companyName),
    photoFileId,
    instagram: field(formData, "instagram", LIMITS.social),
    website: normaliseUrl(field(formData, "website", LIMITS.social)),
    intro: field(formData, "intro", LIMITS.intro),
    goals: field(formData, "goals", LIMITS.intro),
    updatedAt: new Date().toISOString(),
  });
  if (photoError) {
    redirect(`/profiel?fout=${encodeURIComponent(`Je gegevens zijn opgeslagen, maar de foto niet: ${photoError}`)}`);
  }
  redirect(`/profiel?melding=${encodeURIComponent("Je profiel is opgeslagen.")}`);
}
