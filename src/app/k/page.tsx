import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth/session";
import { coupleIdOf } from "@/lib/ws/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Wedding Space" };

/** Entry point after login for couple accounts: on to their own portal. */
export default async function MySpace() {
  const user = await requireUser();
  if (user.role === "owner") redirect("/beheer/bruidsparen");
  if (user.role !== "couple") redirect("/dashboard");
  const own = await coupleIdOf(user.id);
  if (own) redirect(`/k/${own}`);
  return (
    <main className="ws-theme flex flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow mt-32">Your Wedding Space</p>
      <h1 className="mt-2 text-3xl">Nog even geduld</h1>
      <p className="mt-2 max-w-md text-muted">Jullie Wedding Space is op dit moment niet beschikbaar. Neem contact op met Sabine als je denkt dat dit niet klopt.</p>
      <form action={logout} className="mt-6"><button type="submit" className="btn-secondary">Uitloggen</button></form>
    </main>
  );
}
