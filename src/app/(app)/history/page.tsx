import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getItemsForDate } from "@/features/plans/data";
import {
  todayInTimezone,
  isValidDateString,
  formatDateKeyThai,
} from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ItemRow } from "@/features/today/item-row";
import { ResultForm } from "@/features/assessments/result-form";
import { HistoryDatePicker } from "@/features/history/date-picker";
import {
  getSessionsForDate,
  groupSessionsByPlanItem,
} from "@/features/history/data";
import { activityLabel } from "@/lib/status";
import type { StudySession } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
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
  const { date: rawDate } = await searchParams;
  const date = rawDate && isValidDateString(rawDate) ? rawDate : today;

  const [{ version, items }, sessions] = await Promise.all([
    getItemsForDate(workspace.id, date),
    getSessionsForDate(workspace.id, date),
  ]);
  const planItems = items.map((row) => row.item);
  const { sessionsByPlanItemId, unplanned } = groupSessionsByPlanItem(
    sessions,
    planItems
  );
  const rowsWithHistory = items.map((row) => {
    const matchedSessions = sessionsByPlanItemId.get(row.item.id) ?? row.sessions;
    return {
      ...row,
      sessions: matchedSessions,
      actualMinutes: matchedSessions.reduce(
        (sum, s) => sum + (s.duration_minutes ?? 0),
        0
      ),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">ข้อมูลย้อนหลัง</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateKeyThai(date, { buddhist: true })} · แผนที่ใช้:{" "}
            {version ? `${version.name} (v${version.version_number})` : "—"}
          </p>
        </div>
        <HistoryDatePicker date={date} />
      </header>

      <p className="text-xs text-muted-foreground">
        เพิ่ม/แก้ study session และผลสอบย้อนหลังได้ สรุปรายวัน/สัปดาห์/เดือนจะ
        คำนวณใหม่อัตโนมัติ · เวอร์ชันแผนเดิมยังคงแก้ไม่ได้
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          รายการตามแผนของวันนี้
        </h2>
        {rowsWithHistory.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการตามแผนในวันนี้"
            description={
              sessions.length > 0
                ? "ยังมีประวัติที่ทำจริงด้านล่าง"
                : "ยังสามารถบันทึกผลสอบแบบอิสระด้านล่างได้"
            }
          />
        ) : (
          rowsWithHistory.map((row) => (
            <ItemRow key={row.item.id} row={row} date={date} />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">
              ประวัติที่ทำจริง
            </h2>
            <p className="text-xs text-muted-foreground">
              {sessions.length} sessions ·{" "}
              {sessions.reduce((sum, s) => sum + s.duration_minutes, 0)} นาที
            </p>
          </div>
        </div>
        {sessions.length === 0 ? (
          <EmptyState
            title="ยังไม่มีประวัติที่ทำจริงในวันนี้"
            description="ประวัติที่ import หรือบันทึกเองจะแสดงที่ส่วนนี้"
          />
        ) : (
          <div className="grid gap-2">
            {sessions.map((session) => (
              <HistorySessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>บันทึกผลสอบย้อนหลัง (อิสระ)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultForm
            subject="ทั่วไป"
            passingPercentage={70}
            defaultDate={date}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function HistorySessionCard({ session }: { session: StudySession }) {
  const lesson = session.actual_lesson_from
    ? `${session.actual_lesson_from}${
        session.actual_lesson_to &&
        session.actual_lesson_to !== session.actual_lesson_from
          ? `–${session.actual_lesson_to}`
          : ""
      }`
    : null;
  const score =
    session.score != null && session.max_score != null
      ? `${session.score}/${session.max_score}`
      : null;
  const answerCounts =
    session.correct != null ||
    session.incorrect != null ||
    session.total_questions != null
      ? `ถูก ${session.correct ?? "—"} / ผิด ${session.incorrect ?? "—"} / รวม ${
          session.total_questions ?? "—"
        }`
      : null;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{session.subject ?? "ไม่ระบุวิชา"}</span>
              {session.course_code ? (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                  {session.course_code}
                </span>
              ) : null}
              {session.activity_type ? (
                <span className="text-xs text-muted-foreground">
                  {activityLabel(session.activity_type)}
                </span>
              ) : null}
              {lesson ? (
                <span className="text-xs text-muted-foreground">
                  บท {lesson}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {session.start_time && session.end_time
                ? `${session.start_time}–${session.end_time}`
                : "ไม่ระบุช่วงเวลา"} · {session.duration_minutes} นาที
            </p>
            {score || answerCounts ? (
              <p className="text-xs text-muted-foreground">
                {score ? `คะแนน ${score}` : null}
                {score && answerCounts ? " · " : null}
                {answerCounts}
              </p>
            ) : null}
            {session.note ? (
              <p className="text-sm text-muted-foreground">{session.note}</p>
            ) : null}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {session.plan_item_id || session.source_activity_id || session.assessment_source_external_id
              ? "เชื่อมกับแผนแล้ว"
              : "อิสระ"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
