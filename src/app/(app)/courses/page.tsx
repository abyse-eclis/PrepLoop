import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { calculateCourseProgress } from "@/lib/courses";
import { subjectLabel } from "@/lib/subjects";
import type { Course, CourseLesson } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const t0 = Date.now();
  const workspace = await getActiveWorkspace();
  if (!workspace) return <EmptyState title="ยังไม่มี Workspace" action={<Link href="/imports"><Button>ไปหน้านำเข้า</Button></Link>} />;
  const supabase = await createServerSupabase();
  const [{ data: coursesData }, { data: lessonsData }, { data: completed }] = await Promise.all([
    supabase.from("courses").select("*").eq("workspace_id", workspace.id).order("code", { ascending: true }),
    supabase.from("course_lessons").select("id, course_id, external_id, lesson_number, title, section, order_index, lesson_url, source_type").eq("workspace_id", workspace.id).order("lesson_number", { ascending: true }),
    supabase.from("study_plan_items").select("course_code, lesson_to, item_status_overrides!inner(status)").eq("workspace_id", workspace.id),
  ]);
  if (process.env.NODE_ENV === "development") console.info(`[perf] /courses data ${Date.now() - t0}ms`);

  const courses = (coursesData as Course[] | null) ?? [];
  const lessons = (lessonsData as CourseLesson[] | null) ?? [];
  const maxCompletedByCourse = new Map<string, string>();
  for (const it of (completed as Array<{ course_code: string | null; lesson_to: string | null; item_status_overrides: { status: string } | { status: string }[] }> | null) ?? []) {
    const ov = Array.isArray(it.item_status_overrides) ? it.item_status_overrides[0] : it.item_status_overrides;
    if (ov?.status !== "completed" || !it.course_code || !it.lesson_to) continue;
    const cur = maxCompletedByCourse.get(it.course_code);
    if (!cur || it.lesson_to > cur) maxCompletedByCourse.set(it.course_code, it.lesson_to);
  }
  const lessonsByCourse = new Map<string, CourseLesson[]>();
  for (const l of lessons) lessonsByCourse.set(l.course_id, [...(lessonsByCourse.get(l.course_id) ?? []), l]);

  return <div className="flex flex-col gap-6">
    <header><h1 className="text-xl font-bold">คอร์สและบทเรียน</h1><p className="text-sm text-muted-foreground">ภาพรวมแบบย่อจาก Learning Source JSON และความคืบหน้าจริง</p></header>
    {courses.length === 0 ? <EmptyState title="ยังไม่มีคอร์ส" description="นำเข้า Learning Source Catalog JSON เพื่อเพิ่มคอร์สและบทเรียน" action={<Link href="/imports"><Button>นำเข้า</Button></Link>} /> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{courses.map((course) => {
        const courseLessons = lessonsByCourse.get(course.id) ?? [];
        const progress = calculateCourseProgress(courseLessons, maxCompletedByCourse.get(course.code));
        return <Link key={course.id} href={`/courses/${encodeURIComponent(course.code)}`} className="group block h-full">
          <Card className="h-full border-border/80 shadow-sm transition hover:border-primary/60 hover:shadow-md">
            <CardHeader className="gap-2"><div className="text-sm font-semibold text-primary">{course.code}</div><CardTitle className="text-lg">{course.name}</CardTitle><p className="text-sm text-muted-foreground">{subjectLabel(course.subject)}</p></CardHeader>
            <CardContent className="flex flex-col gap-3"><div className="grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-bold">{progress.totalCount}</div><div className="text-xs text-muted-foreground">บททั้งหมด</div></div><div><div className="text-lg font-bold">{progress.doneCount}</div><div className="text-xs text-muted-foreground">เรียนแล้ว</div></div><div><div className="text-lg font-bold">{progress.percent}%</div><div className="text-xs text-muted-foreground">คืบหน้า</div></div></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress.percent}%` }} /></div><div className="pt-1 text-sm font-medium text-primary group-hover:underline">ดูรายละเอียด</div></CardContent>
          </Card>
        </Link>})}</div>}
  </div>;
}
