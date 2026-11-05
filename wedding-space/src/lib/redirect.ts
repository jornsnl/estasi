import { redirect } from "next/navigation";

/** Back to a page with a message (?melding=) or an error (?fout=); keeps an #anchor at the end. */
export function done(path: string, message: string, isError = false): never {
  const [base, hash] = path.split("#");
  redirect(`${base}${base.includes("?") ? "&" : "?"}${isError ? "fout" : "melding"}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`);
}

export const str = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);

/** "YYYY-MM-DD" from a date input, or null. */
export function dateField(formData: FormData, name: string): string | null {
  const value = str(formData, name, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}
