"use client";

/** "Alles selecteren" for the guest checkboxes that belong to the mail form (form="..."). */
export function SelectAllGuests({ form }: { form: string }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="accent-[#6B1E2E]"
        onChange={(e) => {
          document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"][name="gast"]`).forEach((box) => {
            box.checked = e.target.checked;
          });
        }}
      />
      Alle gasten met e-mailadres
    </label>
  );
}
