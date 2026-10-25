"use server";

import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { storeUpload, UploadError } from "@/lib/uploads";

const field = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);

export async function saveProfile(formData: FormData) {
  const user = await requireStudent();
  const store = getStore();
  const current = await store.getProfile(user.id);

  let photoFileId = current?.photoFileId ?? null;
  try {
    const photo = await storeUpload(formData.get("photo"), { belongsTo: user.id, uploadedBy: user.id });
    if (photo) {
      if (!photo.mime.startsWith("image/")) throw new UploadError("Kies een afbeelding als profielfoto.");
      photoFileId = photo.id;
    }
  } catch (err) {
    if (err instanceof UploadError) redirect(`/profiel?fout=${encodeURIComponent(err.message)}`);
    throw err;
  }
  if (formData.get("removePhoto") === "on") photoFileId = null;

  const name = field(formData, "name", 120);
  if (name && name !== user.name) await store.updateUser(user.id, { name });

  await store.saveProfile({
    userId: user.id,
    phone: field(formData, "phone", 40),
    city: field(formData, "city", 120),
    companyName: field(formData, "companyName", 160),
    photoFileId,
    instagram: field(formData, "instagram", 200),
    website: field(formData, "website", 200),
    intro: field(formData, "intro", 3000),
    goals: field(formData, "goals", 3000),
    updatedAt: new Date().toISOString(),
  });
  redirect(`/profiel?melding=${encodeURIComponent("Je profiel is opgeslagen.")}`);
}
