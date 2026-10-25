import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">Wedding Plan Academy</p>
      <h1 className="mt-2 text-4xl">Pagina niet gevonden</h1>
      <Link href="/" className="btn-primary mt-6">Naar het begin</Link>
    </div>
  );
}
