import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { todayInTimezone } from "@/lib/dates";
import { scoreTrend } from "@/lib/calculations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SourceCard } from "@/features/assessments/source-card";
import {
  PromptGeneratorClient,
  type CompletedLessonOption,
} from "@/features/assessments/prompt-generator-client";
import type { AssessmentAttempt, AssessmentSource } from "@/types/db";

export const dynamic = "force-dynamic";

const TYPES = ["diagnostic", "quiz", "exercise", "mock"] as const;
const TYPE_LABELS: Record<string, string> = {
  diagnostic: "Diagnostic",
  quiz: "Quiz",
  exercise: "แบบฝึกหัด",
  mock: "Mock",
};

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
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

  const today = todayInTimezone(workspace.timezone);
  const supabase = await createServerSupabase();

  let sourceQuery = supabase
    .from("assessment_sources")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("subject", { ascending: true });
  if (type && TYPES.includes(type as (typeof TYPES)[number])) {
    sourceQuery = sourceQuery.eq("type", type);
  }

  const [{ data: sourcesData }, { data: attemptsData }, { data: completedItems }, { data: lessonsData }] =
    await Promise.all([
      sourceQuery,
      supabase
        .from("assessment_attempts")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("attempt_date", { ascending: false })
        .limit(30),
      supabase
        .from("study_plan_items")
        .select("course_code, lesson_to, subject, id, item_status_overrides!inner(status)")
        .eq("workspace_id", workspace.id),
      supabase
        .from("course_lessons")
        .select("lesson_number, title, section, courses!inner(code, subject)")
        .eq("workspace_id", workspace.id)
        .order("lesson_number", { ascending: true }),
    ]);

  const sources = (sourcesData as AssessmentSource[] | null) ?? [];
  const attempts = (attemptsData as AssessmentAttempt[] | null) ?? [];

  // Determine max completed lesson per course from completed plan items.
  const maxCompletedByCourse = new Map<string, string>();
  for (const it of (completedItems as Array<{
    course_code: string | null;
    lesson_to: string | null;
    item_status_overrides: { status: string } | { status: string }[];
  }> | null) ?? []) {
    const ov = Array.isArray(it.item_status_overrides)
      ? it.item_status_overrides[0]
      : it.item_status_overrides;
    if (ov?.status !== "completed" || !it.course_code || !it.lesson_to) continue;
    const cur = maxCompletedByCourse.get(it.course_code);
    if (!cur || it.lesson_to > cur) {
      maxCompletedByCourse.set(it.course_code, it.lesson_to);
    }
  }

  const completedLessons: CompletedLessonOption[] = [];
  for (const l of (lessonsData as Array<{
    lesson_number: string;
    title: string;
    courses: { code: string; subject: string } | { code: string; subject: string }[];
  }> | null) ?? []) {
    const course = Array.isArray(l.courses) ? l.courses[0] : l.courses;
    if (!course) continue;
    const maxDone = maxCompletedByCourse.get(course.code);
    if (maxDone && l.lesson_number <= maxDone) {
      completedLessons.push({
        subject: course.subject,
        courseCode: course.code,
        lessonNumber: l.lesson_number,
        title: l.title,
      });
    }
  }
  const promptSubjects = Array.from(
    new Set(completedLessons.map((l) => l.subject))
  );

  // Score history grouped by source/subject with trend.
  const attemptsBySubject = new Map<string, AssessmentAttempt[]>();
  for (const a of attempts) {
    const key = a.subject ?? "อื่น ๆ";
    const arr = attemptsBySubject.get(key) ?? [];
    arr.push(a);
    attemptsBySubject.set(key, arr);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">ข้อสอบและแบบฝึกหัด</h1>
        <p className="text-sm text-muted-foreground">
          เปิดข้อสอบ/เฉลย บันทึกผล และดูประวัติคะแนน
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href="/assessments">
          <Button variant={!type ? "default" : "outline"} size="sm">
            ทั้งหมด
          </Button>
        </Link>
        {TYPES.map((t) => (
          <Link key={t} href={`/assessments?type=${t}`}>
            <Button variant={type === t ? "default" : "outline"} size="sm">
              {TYPE_LABELS[t]}
            </Button>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        {sources.length === 0 ? (
          <EmptyState
            title="ยังไม่มีชุดข้อสอบ"
            description="นำเข้า Learning Source JSON เพื่อเพิ่มชุดข้อสอบ หรือใช้ Prompt Generator ด้านล่าง"
          />
        ) : (
          sources.map((s) => (
            <SourceCard key={s.id} source={s} today={today} />
          ))
        )}
      </section>

      <PromptGeneratorClient
        lessons={completedLessons}
        subjects={promptSubjects.length > 0 ? promptSubjects : ["ยังไม่มีบทที่เรียนจบ"]}
      />

      <Card>
        <CardHeader>
          <CardTitle>ประวัติคะแนน</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีผลสอบ</p>
          ) : (
            <div className="flex flex-col gap-4">
              {Array.from(attemptsBySubject.entries()).map(([subj, list]) => {
                const chronological = [...list].sort((a, b) =>
                  a.attempt_date.localeCompare(b.attempt_date)
                );
                return (
                  <div key={subj}>
                    <p className="mb-1 text-sm font-medium">{subj}</p>
                    <div className="scroll-x">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="py-1 pr-3">วันที่</th>
                            <th className="py-1 pr-3">คะแนน</th>
                            <th className="py-1 pr-3">%</th>
                            <th className="py-1 pr-3">ผล</th>
                            <th className="py-1 pr-3">แนวโน้ม</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chronological.map((a, idx) => {
                            const prev = chronological[idx - 1]?.percentage ?? null;
                            const trend = scoreTrend(a.percentage ?? 0, prev);
                            return (
                              <tr key={a.id} className="border-t border-border/60">
                                <td className="py-1 pr-3">{a.attempt_date}</td>
                                <td className="py-1 pr-3 tabular-nums">
                                  {a.score}/{a.max_score}
                                </td>
                                <td className="py-1 pr-3 tabular-nums">
                                  {a.percentage ?? "-"}%
                                </td>
                                <td className="py-1 pr-3">
                                  {a.passed ? (
                                    <span className="text-primary">ผ่าน</span>
                                  ) : (
                                    <span className="text-destructive">
                                      ไม่ผ่าน
                                    </span>
                                  )}
                                </td>
                                <td className="py-1 pr-3">
                                  {trend === "up"
                                    ? "▲"
                                    : trend === "down"
                                      ? "▼"
                                      : trend === "same"
                                        ? "–"
                                        : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
