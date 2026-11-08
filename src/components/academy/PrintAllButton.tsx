"use client";

/** Opens every folded part (earlier versions) and prints the page, so the pdf holds everything. */
export function PrintAllButton({ label = "Afdrukken of opslaan als pdf" }: { label?: string }) {
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => {
        document.querySelectorAll("details").forEach((d) => (d.open = true));
        window.print();
      }}
    >
      {label}
    </button>
  );
}
