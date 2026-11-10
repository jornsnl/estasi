import { PreviewBar } from "@/components/academy/PreviewBar";
import { DashboardView } from "@/components/academy/StudentViews";
import { previewLinks, previewStudents, previewTarget } from "@/lib/academy-preview";
import { getStore } from "@/lib/data";
import { viewableForStudent } from "@/lib/ws/meekijkers";

export const metadata = { title: "Bekijk als cursist" };

/** "Bekijk als cursist": the dashboard of a student, from the beheer (the layout checks the owner). */
export default async function PreviewDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const target = await previewTarget(await searchParams);
  const [settings, students, walkAlong] = await Promise.all([
    getStore().getSettings(),
    previewStudents(),
    target.student ? viewableForStudent(target.student.id) : Promise.resolve([]),
  ]);
  return (
    <div>
      <PreviewBar target={target} students={students} active="dashboard" />
      <DashboardView o={target.o} settings={settings} walkAlong={walkAlong} links={previewLinks(target.query)} />
    </div>
  );
}
