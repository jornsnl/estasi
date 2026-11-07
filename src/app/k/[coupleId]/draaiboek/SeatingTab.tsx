/** Dinner and ceremony seating. */
export async function SeatingTab({}: { coupleId: string; isAdmin: boolean }) {
  return <div className="card p-5 text-sm text-muted">De opstelling volgt.</div>;
}

export async function SeatingPrint({}: { coupleId: string }) {
  return null;
}
