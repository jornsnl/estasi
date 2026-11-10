/**
 * Makes a photo smaller in the browser before it is sent: at most 2400 px on the longest side,
 * as JPG. Phones and cameras give 5 to 25 MB; after this a photo is a few hundred KB and always
 * fits through the upload (feedback Sabine: large photos were not uploaded). Used by
 * src/components/PhotoInput.tsx; Your Wedding Space and the community do the same.
 */
export const PHOTO_MAX_SIDE = 2400;
const KEEP_BELOW = 1.5 * 1024 * 1024;

export const HEIC_MESSAGE =
  "Deze foto (HEIC) kan deze browser niet openen. Kies een JPG of PNG, of zet op de iPhone bij Camera, Formaten \"Meest compatibel\" aan.";

const SHRINK = /\.(jpe?g|png|webp|heic|heif)$/i;

export async function shrinkPhoto(file: File): Promise<File> {
  if (!SHRINK.test(file.name) && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return file;
  const heic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/.test(file.type);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (heic) throw new Error(HEIC_MESSAGE);
    return file;
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  // Small enough already, and a format every browser shows: keep it as it is (a png keeps its transparency).
  if (scale === 1 && file.size <= KEEP_BELOW && !heic) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  // JPG has no transparency: a white background instead of black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
