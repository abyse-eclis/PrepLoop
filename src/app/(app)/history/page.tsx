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
import { SessionHistoryList } from "@/features/sessions/session-history";
import {
  getSessionsForDate,
  groupSessionsByPlanItem,
} from "@/features/history/data";

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
  const { sessionsByPlanItemId, matches, unplanned } = groupSessionsByPlanItem(
    sessions,
    planItems
  );
  const rowsWithHistory = items.map((row) => {
    const matchedSessions = sessionsByPlanItemId.get(row.item.id) ?? row.sessions;
    return {
      ...row,
      sessions: matchedSessions,
      actualMinutes: matchedSessions.reduce(
        (sum, session) => sum + (session.duration_minutes ?? 0),
        0
      ),
    };
  });
  const sessionHistory = matches.map(({ session, planItem }) => ({
    session,
    item: planItem,
  }));
  const totalMinutes = sessions.reduce(
    (sum, session) => sum + (session.duration_minutes ?? 0),
    0
  );

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

      <Card>
        <CardHeader>
          <CardTitle>Study Sessions ที่เกิดขึ้นจริง</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {sessions.length} sessions · {totalMinutes} นาที ·{" "}
            {unplanned.length} อิสระ
          </p>
          <SessionHistoryList sessions={sessionHistory} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          รายการตามแผนของวันที่เลือก
        </h2>
        {rowsWithHistory.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการตามแผนในวันนี้"
            description={
              sessions.length > 0
                ? "ยังมีประวัติที่ทำจริงด้านบน"
                : "ยังสามารถบันทึกผลสอบแบบอิสระด้านล่างได้"
            }
          />
        ) : (
          rowsWithHistory.map((row) => (
            <ItemRow key={row.item.id} row={row} date={date} />
          ))
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
