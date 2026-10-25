/** Shows the one-line message that server actions pass back via ?melding= or ?fout=. */
export async function Notice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ok = typeof params.melding === "string" ? params.melding : null;
  const error = typeof params.fout === "string" ? params.fout : null;
  if (!ok && !error) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
        error ? "border-bordeaux/30 bg-bordeaux-soft text-bordeaux" : "border-success/20 bg-success-soft text-success"
      }`}
    >
      {error ?? ok}
    </div>
  );
}
