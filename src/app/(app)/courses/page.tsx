import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import type { Course, CourseLesson } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return (
      <EmptyState
        title="ยังไม่มี Workspace"
        action={
          <Link href="/imports">
            <Button>ไปหน้านำเข้า</Button>
          </Link>
        }
      />
    );
  }

  const supabase = await createServerSupabase();
  const [{ data: coursesData }, { data: lessonsData }, { data: completed }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("code", { ascending: true }),
      supabase
        .from("course_lessons")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("lesson_number", { ascending: true }),
      supabase
        .from("study_plan_items")
        .select("course_code, lesson_to, item_status_overrides!inner(status)")
        .eq("workspace_id", workspace.id),
    ]);

  const courses = (coursesData as Course[] | null) ?? [];
  const lessons = (lessonsData as CourseLesson[] | null) ?? [];

  const maxCompletedByCourse = new Map<string, string>();
  for (const it of (completed as Array<{
    course_code: string | null;
    lesson_to: string | null;
    item_status_overrides: { status: string } | { status: string }[];
  }> | null) ?? []) {
    const ov = Array.isArray(it.item_status_overrides)
      ? it.item_status_overrides[0]
      : it.item_status_overrides;
    if (ov?.status !== "completed" || !it.course_code || !it.lesson_to) continue;
    const cur = maxCompletedByCourse.get(it.course_code);
    if (!cur || it.lesson_to > cur) maxCompletedByCourse.set(it.course_code, it.lesson_to);
  }

  const lessonsByCourse = new Map<string, CourseLesson[]>();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push(l);
    lessonsByCourse.set(l.course_id, arr);
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">คอร์สและบทเรียน</h1>
        <p className="text-sm text-muted-foreground">
          ข้อมูลมาจาก Learning Source JSON (อ่านอย่างเดียว)
        </p>
      </header>

      {courses.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคอร์ส"
          description="นำเข้า Learning Source Catalog JSON เพื่อเพิ่มคอร์สและบทเรียน"
          action={
            <Link href="/imports">
              <Button>นำเข้า</Button>
            </Link>
          }
        />
      ) : (
        courses.map((course) => {
          const courseLessons = lessonsByCourse.get(course.id) ?? [];
          const maxDone = maxCompletedByCourse.get(course.code);
          const doneCount = maxDone
            ? courseLessons.filter((l) => l.lesson_number <= maxDone).length
            : 0;
          return (
            <Card key={course.id}>
              <CardHeader>
                <CardTitle>
                  {course.code} · {course.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  วิชา {course.subject} · {courseLessons.length} บทเรียน · เรียนแล้ว{" "}
                  {doneCount} บท
                </p>
              </CardHeader>
              <CardContent>
                {courseLessons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ไม่มีรายการบทเรียน</p>
                ) : (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {courseLessons.slice(0, 60).map((l) => {
                      const done = maxDone ? l.lesson_number <= maxDone : false;
                      return (
                        <li
                          key={l.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className={
                              done
                                ? "h-2 w-2 rounded-full bg-primary"
                                : "h-2 w-2 rounded-full bg-muted"
                            }
                          />
                          <span className="text-muted-foreground">
                            {l.lesson_number}
                          </span>
                          <span className="truncate">{l.title}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {courseLessons.length > 60 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    …และอีก {courseLessons.length - 60} บท
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
