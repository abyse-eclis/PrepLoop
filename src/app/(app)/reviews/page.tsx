import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { todayInTimezone, addDays } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Stat } from "@/components/ui/misc";
import { ReviewItem } from "@/features/reviews/review-item";
import { getReviewPageData } from "@/features/reviews/data";
import { ReviewAiPanel, type ReviewCandidate } from "@/features/reviews/ai-panel";
import { RecoveryPanel } from "@/features/plans/plan-actions-client";
import { subjectLabel } from "@/lib/subjects";
import type { AssessmentAttempt, ReviewTask, StudySession } from "@/types/db";

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
  const data = await getReviewPageData(workspace.id, today);
  const supabase = await createServerSupabase();
  const [{ data: sessionsData }, { data: attemptsData }, { data: errorsData }] =
    await Promise.all([
      supabase
        .from("study_sessions")
        .select("*")
        .eq("workspace_id", workspace.id)
        .not("note", "is", null)
        .order("session_date", { ascending: false })
        .limit(30),
      supabase
        .from("assessment_attempts")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("attempt_date", { ascending: false })
        .limit(30),
      supabase
        .from("error_logs")
        .select("id, subject, topic, note, score, max_score, created_at, error_type")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
  const sessions = (sessionsData as StudySession[] | null) ?? [];
  const attempts = (attemptsData as AssessmentAttempt[] | null) ?? [];
  const errors =
    (errorsData as
      | Array<{
          id: string;
          subject: string | null;
          topic: string | null;
          note: string | null;
          score: number | null;
          max_score: number | null;
          created_at: string;
          error_type: string;
        }>
      | null) ?? [];
  const candidates: ReviewCandidate[] = [
    ...sessions
      .filter((session) => session.note)
      .map((session) => ({
        id: session.id,
        topic:
          session.lesson_title ??
          session.actual_lesson_from ??
          session.course_code ??
          session.subject ??
          "หัวข้อที่บันทึกไว้",
        subject: subjectLabel(session.subject),
        courseCode: session.course_code,
        note: session.note,
        source: "Study Session note",
        lastDate: session.session_date,
        sufficient: false,
      })),
    ...attempts
      .filter(
        (attempt) =>
          attempt.percentage !== null &&
          attempt.percentage < attempt.passing_percentage
      )
      .map((attempt) => ({
        id: attempt.id,
        topic: attempt.notes ?? attempt.subject ?? "แบบทดสอบ",
        subject: subjectLabel(attempt.subject),
        score: `${attempt.score}/${attempt.max_score}`,
        source: "Assessment",
        lastDate: attempt.attempt_date,
        sufficient: true,
      })),
    ...errors.map((error) => ({
      id: error.id,
      topic: error.topic ?? error.error_type,
      subject: subjectLabel(error.subject),
      note: error.note,
      score:
        error.score !== null && error.max_score !== null
          ? `${error.score}/${error.max_score}`
          : null,
      source: "Error log",
      lastDate: error.created_at.slice(0, 10),
      sufficient: true,
    })),
  ];

  const pending = data.pendingReviews;
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

  const done = data.recentDone;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">งานทบทวน</h1>
        <p className="text-sm text-muted-foreground">
          ทบทวนตามรอบ spaced repetition และวิเคราะห์จุดอ่อนจากข้อมูลจริงเมื่อกดสั่งงาน
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Study Session"
          value={data.evidence.studySessions}
          hint="พร้อมใช้เป็น evidence"
        />
        <Stat
          label="Quiz / Mock"
          value={data.evidence.assessmentAttempts}
          hint="ผลสอบที่บันทึกแล้ว"
        />
        <Stat
          label="Weakness"
          value={data.evidence.weaknesses}
          hint="จาก topic/error logs"
        />
        <Stat
          label="Review pending"
          value={data.evidence.pendingReviews}
          hint="ไม่ได้โหลด raw notes"
        />
      </section>

      <RecoveryPanel
        title="วิเคราะห์จุดอ่อน"
        description="ระบบจะค่อย fetch evidence และสร้าง preview ของแผนทบทวนเพิ่มเติมเมื่อกดวิเคราะห์เท่านั้น"
        actionLabel="วิเคราะห์จุดอ่อน"
      />

      {pending.length === 0 ? (
        <EmptyState
          title="ยังไม่มีแผนทบทวน"
          description="เมื่อมีข้อมูลการเรียนหรือผลแบบทดสอบ สามารถให้ระบบวิเคราะห์จุดอ่อนและสร้างแผนทบทวนเพิ่มเติมได้"
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
