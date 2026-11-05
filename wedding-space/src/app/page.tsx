import { redirect } from "next/navigation";
import { currentAccount, homeFor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const account = await currentAccount();
  redirect(account ? homeFor(account) : "/login");
}
