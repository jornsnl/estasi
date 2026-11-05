import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">Your Wedding Space</p>
      <h1 className="mt-2 text-3xl">Deze pagina bestaat niet</h1>
      <p className="mt-2 text-muted">Of je hebt er geen toegang toe.</p>
      <Link href="/" className="btn-primary mt-6">Naar het overzicht</Link>
    </main>
  );
}
