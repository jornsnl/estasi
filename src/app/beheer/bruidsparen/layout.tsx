import { wsConfigured } from "@/lib/ws/db";

/** Your Wedding Space needs the database connection (DATABASE_URL); say so instead of failing. */
export default function WeddingSpaceAdminLayout({ children }: { children: React.ReactNode }) {
  if (!wsConfigured()) {
    return (
      <div className="card max-w-2xl p-6">
        <p className="eyebrow">Your Wedding Space</p>
        <h1 className="mt-1 text-3xl">Database nog niet gekoppeld</h1>
        <p className="mt-2 text-muted">
          Zet <code>DATABASE_URL</code> (de Session pooler connection string van Supabase) in de hosting. Dezelfde waarde die de migraties al gebruiken.
        </p>
      </div>
    );
  }
  return children;
}
