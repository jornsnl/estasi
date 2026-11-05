import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { AdminNav } from "@/components/AdminNav";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-6xl px-4 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link href="/beheer" className="leading-tight">
            <span className="block font-serif text-lg font-semibold">Estasi Weddings</span>
            <span className="eyebrow block text-[10px]">Your Wedding Space · Beheer</span>
          </Link>
          <form action={logout} className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{admin.name}</span>
            <button type="submit" className="text-bordeaux hover:underline">Uitloggen</button>
          </form>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-16">{children}</main>
    </div>
  );
}
