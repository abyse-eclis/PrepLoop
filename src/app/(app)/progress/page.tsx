import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { todayInTimezone } from "@/lib/dates";
import {
  getDailyProgress,
  getRangeProgress,
  weekBounds,
  monthBounds,
} from "@/features/progress/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stat, EmptyState, Progress } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

type Tab = "daily" | "weekly" | "monthly";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (["daily", "weekly", "monthly"] as const).includes(
    rawTab as Tab
  )
    ? (rawTab as Tab)
    : "daily";

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

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold">ความคืบหน้า</h1>
        <p className="text-sm text-muted-foreground">
          สรุปรายวัน รายสัปดาห์ และรายเดือน (คำนวณจากข้อมูลจริง)
        </p>
      </header>

      <div className="flex gap-2">
        {(["daily", "weekly", "monthly"] as const).map((t) => (
          <Link key={t} href={`/progress?tab=${t}`}>
            <Button variant={tab === t ? "default" : "outline"} size="sm">
              {t === "daily" ? "รายวัน" : t === "weekly" ? "รายสัปดาห์" : "รายเดือน"}
            </Button>
          </Link>
        ))}
      </div>

      {tab === "daily" ? <DailyView workspaceId={workspace.id} date={today} /> : null}
      {tab === "weekly" ? (
        <RangeView
          workspaceId={workspace.id}
          bounds={weekBounds(today)}
          label="สัปดาห์นี้"
        />
      ) : null}
      {tab === "monthly" ? (
        <RangeView
          workspaceId={workspace.id}
          bounds={monthBounds(today)}
          label="เดือนนี้"
          monthly
        />
      ) : null}
    </div>
  );
}

async function DailyView({
  workspaceId,
  date,
}: {
  workspaceId: string;
  date: string;
}) {
  const p = await getDailyProgress(workspaceId, date);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>วันนี้ ({p.date})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={p.timePercent} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="เป้าหมาย" value={`${p.targetMinutes}น.`} />
            <Stat label="ทำจริง" value={`${p.actualMinutes}น.`} />
            <Stat label="Time %" value={`${p.timePercent}%`} />
            <Stat label="Task %" value={`${p.taskPercent}%`} />
            <Stat label="Weighted %" value={`${p.weightedPercent}%`} />
            <Stat label="Sessions" value={p.sessionCount} />
            <Stat
              label="งานเสร็จ/ทั้งหมด"
              value={`${p.completedItems}/${p.totalItems}`}
            />
            <Stat label="ทบทวนถึงกำหนด" value={p.reviewDue} />
          </div>
          <p className="text-xs text-muted-foreground">
            แผน: {p.planVersionName ?? "—"} · งานค้าง {p.pendingItems} · ผลสอบวันนี้{" "}
            {p.attemptCount}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

async function RangeView({
  workspaceId,
  bounds,
  label,
  monthly,
}: {
  workspaceId: string;
  bounds: { start: string; end: string };
  label: string;
  monthly?: boolean;
}) {
  const p = await getRangeProgress(workspaceId, bounds.start, bounds.end);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {label} ({p.start} → {p.end})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={p.timePercent} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="เวลา (จริง/เป้า)"
              value={`${p.actualMinutes}/${p.targetMinutes}น.`}
            />
            <Stat label="Time %" value={`${p.timePercent}%`} />
            <Stat
              label="วันที่ครบเป้า"
              value={`${p.daysMet}/${p.totalDays}`}
            />
            <Stat label="จำนวนข้อสอบ" value={p.attemptCount} />
            <Stat
              label="Pass rate"
              value={p.passRate === null ? "—" : `${p.passRate}%`}
            />
            <Stat
              label="คะแนนเฉลี่ย"
              value={p.averagePercentage === null ? "—" : `${p.averagePercentage}%`}
            />
            <Stat label="ทบทวนเกินกำหนด" value={p.overdueReviews} />
            {monthly ? (
              <Stat label="Recovery ทั้งหมด" value={p.recoveryCount} />
            ) : (
              <Stat label="Recovery" value={p.recoveryCount} />
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">ชั่วโมงแยกวิชา</p>
            {p.minutesBySubject.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="flex flex-col gap-2">
                {p.minutesBySubject.map((s) => {
                  const max = p.minutesBySubject[0]?.minutes || 1;
                  return (
                    <div key={s.subject}>
                      <div className="flex justify-between text-xs">
                        <span>{s.subject}</span>
                        <span className="tabular-nums">{s.minutes}น.</span>
                      </div>
                      <Progress value={(s.minutes / max) * 100} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {monthly ? (
            <p className="text-xs text-muted-foreground">
              สรุปความเสี่ยงสอบ (rule-based): {riskSummary(p.timePercent, p.passRate)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function riskSummary(timePercent: number, passRate: number | null): string {
  if (timePercent >= 80 && (passRate === null || passRate >= 70)) {
    return "ความเสี่ยงต่ำ — ทำได้ตามแผนและผลสอบอยู่ในเกณฑ์";
  }
  if (timePercent >= 60) {
    return "ความเสี่ยงปานกลาง — ควรเพิ่มเวลาหรืออุดจุดอ่อน พิจารณาขอ Recovery";
  }
  return "ความเสี่ยงสูง — ทำเวลาได้น้อย ควรขอ Recovery Plan และจัดลำดับใหม่";
}
