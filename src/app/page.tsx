import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  redirect(user.role === "owner" ? "/beheer" : "/dashboard");
}
