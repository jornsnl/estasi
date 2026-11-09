import Link from "next/link";
import { Logo } from "./Logo";
import { NavLinks, type NavItem } from "./NavLinks";
import { MobileMenu } from "./MobileMenu";
import { logout } from "@/app/actions/auth";

/** Fixed left menu on desktop, collapsible menu on mobile. Both scroll on their own when the menu is taller than the screen. */
export function AppShell({
  items,
  userName,
  subtitle,
  footer,
  profileHref,
  children,
}: {
  items: NavItem[];
  userName: string;
  subtitle: string;
  footer?: React.ReactNode;
  /** A link to the own profile, next to Uitloggen under the name. */
  profileHref?: string;
  children: React.ReactNode;
}) {
  const sidebar = (
    <div className="flex min-h-full flex-col">
      <div className="px-6 pt-7 pb-8">
        <Logo />
      </div>
      <nav className="flex-1 px-3" aria-label="Hoofdmenu">
        <NavLinks items={items} />
      </nav>
      {footer && <div className="px-6 pb-4">{footer}</div>}
      <div className="border-t border-line px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="truncate text-sm font-medium text-ink">{userName}</p>
        <p className="text-xs text-muted">{subtitle}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {profileHref && (
            <Link href={profileHref} className="text-bordeaux hover:underline">
              Profiel en beveiliging
            </Link>
          )}
          <form action={logout}>
            <button type="submit" className="text-bordeaux hover:underline">
              Uitloggen
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream/40">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 overflow-y-auto overscroll-contain border-r border-line bg-white lg:block">{sidebar}</aside>
      <div className="no-print"><MobileMenu>{sidebar}</MobileMenu></div>
      <main className="lg:pl-64 print:pl-0">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-12">{children}</div>
      </main>
    </div>
  );
}
