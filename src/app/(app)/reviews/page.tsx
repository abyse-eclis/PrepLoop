import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { todayInTimezone, addDays } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ReviewItem } from "@/features/reviews/review-item";
import { ReviewAiPanel, type ReviewCandidate } from "@/features/reviews/ai-panel";
import { subjectLabel } from "@/lib/subjects";
import type { ReviewTask, StudySession, AssessmentAttempt } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
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
  const [{ data }, { data: sessionsData }, { data: attemptsData }, { data: errorsData }] = await Promise.all([
    supabase.from("review_tasks").select("*").eq("workspace_id", workspace.id).order("due_date", { ascending: true }),
    supabase.from("study_sessions").select("*").eq("workspace_id", workspace.id).not("note", "is", null).order("session_date", { ascending: false }).limit(30),
    supabase.from("assessment_attempts").select("*").eq("workspace_id", workspace.id).order("attempt_date", { ascending: false }).limit(30),
    supabase.from("error_logs").select("id, subject, topic, note, score, max_score, created_at, error_type").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const reviews = (data as ReviewTask[] | null) ?? [];
  const sessions = (sessionsData as StudySession[] | null) ?? [];
  const attempts = (attemptsData as AssessmentAttempt[] | null) ?? [];
  const candidates: ReviewCandidate[] = [
    ...sessions.filter((s) => s.note).map((s) => ({ id: s.id, topic: s.lesson_title ?? s.actual_lesson_from ?? s.course_code ?? s.subject ?? "หัวข้อที่บันทึกไว้", subject: subjectLabel(s.subject), courseCode: s.course_code, note: s.note, source: "Study Session note", lastDate: s.session_date, sufficient: false })),
    ...attempts.filter((a) => a.percentage !== null && a.percentage < a.passing_percentage).map((a) => ({ id: a.id, topic: a.notes ?? a.subject ?? "แบบทดสอบ", subject: subjectLabel(a.subject), score: `${a.score}/${a.max_score}`, source: "Assessment", lastDate: a.attempt_date, sufficient: true })),
    ...((errorsData as Array<{ id: string; subject: string | null; topic: string | null; note: string | null; score: number | null; max_score: number | null; created_at: string; error_type: string }> | null) ?? []).map((e) => ({ id: e.id, topic: e.topic ?? e.error_type, subject: subjectLabel(e.subject), note: e.note, score: e.score !== null && e.max_score !== null ? `${e.score}/${e.max_score}` : null, source: "Error log", lastDate: e.created_at.slice(0,10), sufficient: true })),
  ];

  const pending = reviews.filter((r) => r.status === "pending");
  const buckets: Array<{ key: string; label: string; items: ReviewTask[] }> = [
    { key: "overdue", label: "เกินกำหนด", items: pending.filter((r) => r.due_date < today) },
    { key: "today", label: "วันนี้", items: pending.filter((r) => r.due_date === today) },
    {
      key: "1d",
      label: "พรุ่งนี้ (1 วัน)",
      items: pending.filter((r) => r.due_date === addDays(today, 1)),
    },
    {
      key: "3d",
      label: "ภายใน 3 วัน",
      items: pending.filter(
        (r) => r.due_date > addDays(today, 1) && r.due_date <= addDays(today, 3)
      ),
    },
    {
      key: "7d",
      label: "ภายใน 7 วัน",
      items: pending.filter(
        (r) => r.due_date > addDays(today, 3) && r.due_date <= addDays(today, 7)
      ),
    },
    {
      key: "later",
      label: "หลังจากนั้น (ปลายสัปดาห์/เดือน)",
      items: pending.filter((r) => r.due_date > addDays(today, 7)),
    },
  ];

  const done = reviews.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">งานทบทวน</h1>
        <p className="text-sm text-muted-foreground">
          ทบทวนตามรอบ spaced repetition และบันทึกผล
        </p>
      </header>

      {pending.length === 0 ? (
        <EmptyState
          title="ไม่มีงานทบทวนที่ค้าง"
          description="ยังไม่มีงานจาก spaced repetition แต่คุณยังสามารถบันทึกหมายเหตุใน Study Session หรือบันทึกคะแนน Quiz/Diagnostic เพื่อให้ระบบสร้าง candidate ได้"
        />
      ) : (
        buckets
          .filter((b) => b.items.length > 0)
          .map((b) => (
            <Card key={b.key}>
              <CardHeader>
                <CardTitle>
                  {b.label} ({b.items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {b.items.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </CardContent>
            </Card>
          ))
      )}

      {candidates.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>หัวข้อที่ควรทบทวนจากข้อมูลจริง</CardTitle></CardHeader>
          <CardContent className="grid gap-2">{candidates.slice(0, 12).map((c) => <div key={`${c.source}-${c.id}`} className="rounded-md border p-3"><div className="font-medium">{c.topic}</div><div className="text-sm text-muted-foreground">{c.subject}{c.courseCode ? ` · ${c.courseCode}` : ""} · {c.source} · ล่าสุด {c.lastDate}{c.score ? ` · คะแนน ${c.score}` : ""}</div>{c.note ? <p className="mt-1 text-sm">{c.note}</p> : null}</div>)}</CardContent>
        </Card>
      ) : null}

      <ReviewAiPanel candidates={candidates} />

      {done.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>ทบทวนแล้วล่าสุด</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {done.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
