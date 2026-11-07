import Link from "next/link";

/** The styling plan as a tab of the run sheet: shown here, edited on "Stylingplan & Moodboard". */
export async function StylingTab({ coupleId }: { coupleId: string; isAdmin: boolean }) {
  return (
    <div className="card p-5 text-sm text-muted">
      Het stylingplan staat op <Link href={`/k/${coupleId}/styling`} className="text-bordeaux underline">Stylingplan & Moodboard</Link>.
    </div>
  );
}

export async function StylingPrint({}: { coupleId: string }) {
  return null;
}
