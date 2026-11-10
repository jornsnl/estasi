import { CourseView } from "@/components/academy/StudentViews";
import { studentOverview } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";

export const metadata = { title: "Mijn opleiding" };

export default async function CoursePage() {
  const user = await requireStudent();
  const [o, settings] = await Promise.all([studentOverview(user), getStore().getSettings()]);
  return <CourseView o={o} settings={settings} />;
}
