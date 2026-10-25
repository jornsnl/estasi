import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group block leading-tight">
      <span className="block font-serif text-[22px] tracking-wide text-ink">Estasi Weddings</span>
      {!compact && <span className="eyebrow mt-0.5 block text-[10px]">Wedding Plan Academy</span>}
    </Link>
  );
}
