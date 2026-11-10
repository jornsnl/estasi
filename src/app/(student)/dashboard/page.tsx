import { DashboardView } from "@/components/academy/StudentViews";
import { studentOverview } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { viewableForStudent } from "@/lib/ws/meekijkers";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requireStudent();
  const [o, settings, walkAlong] = await Promise.all([studentOverview(user), getStore().getSettings(), viewableForStudent(user.id)]);
  return <DashboardView o={o} settings={settings} walkAlong={walkAlong} />;
}
