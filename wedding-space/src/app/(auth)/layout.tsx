export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="font-serif text-2xl font-semibold text-ink">Estasi Weddings</p>
        <p className="eyebrow mt-1">Your Wedding Space</p>
      </div>
      <div className="card w-full max-w-md p-8">{children}</div>
    </main>
  );
}
