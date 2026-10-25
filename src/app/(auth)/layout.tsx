import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream/60 px-4 py-12">
      <div className="mb-8 text-center">
        <Logo />
      </div>
      <div className="card w-full max-w-md p-8 shadow-sm">{children}</div>
      <p className="mt-6 text-xs text-muted">Beveiligde leeromgeving van Estasi Weddings</p>
    </div>
  );
}
