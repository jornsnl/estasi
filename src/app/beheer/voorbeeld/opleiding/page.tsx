import { PreviewBar } from "@/components/academy/PreviewBar";
import { CourseView } from "@/components/academy/StudentViews";
import { previewLinks, previewStudents, previewTarget } from "@/lib/academy-preview";
import { getStore } from "@/lib/data";

export const metadata = { title: "Bekijk als cursist" };

/** "Bekijk als cursist": Mijn opleiding of a student, from the beheer. */
export default async function PreviewCourse({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const target = await previewTarget(await searchParams);
  const [settings, students] = await Promise.all([getStore().getSettings(), previewStudents()]);
  return (
    <div>
      <PreviewBar target={target} students={students} active="opleiding" />
      <CourseView o={target.o} settings={settings} links={previewLinks(target.query)} />
    </div>
  );
}
