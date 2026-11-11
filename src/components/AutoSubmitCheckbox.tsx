"use client";

/**
 * A tick box that saves its form as soon as it changes (Instellingen, "Er zijn praktijkplekken
 * beschikbaar"). Without JavaScript the form keeps its own save button (in a noscript).
 */
export function AutoSubmitCheckbox({ name, defaultChecked, children }: { name: string; defaultChecked: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-4 w-4 accent-[#722F37]"
      />
      <span>{children}</span>
    </label>
  );
}
