import Link from "next/link";
import type { Workspace, PlanVersion } from "@/types/db";
import type { ResolvedPlanItem } from "@/features/plans/data";
import { daySummary } from "@/lib/calculations";
import { formatDateKeyThai } from "@/lib/dates";
import { Stat, EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemRow } from "./item-row";

const COMPLETED_STATUSES = ["completed"];

export function TodayView({
  workspace,
  date,
  version,
  items,
  dueReviewCount,
}: {
  workspace: Workspace;
  date: string;
  version: PlanVersion | null;
  items: ResolvedPlanItem[];
  dueReviewCount: number;
}) {
  const summary = daySummary({
    items: items.map((r) => ({
      priority: r.item.priority,
      targetMinutes: r.item.target_minutes,
      status: r.status,
    })),
    actualMinutesByItem: items.map((r) => r.actualMinutes),
    completedStatuses: COMPLETED_STATUSES,
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">วันนี้</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateKeyThai(date, { buddhist: true })} · {workspace.timezone}
          </p>
        </div>
        <div className="text-right text-sm">
          {version ? (
            <span className="text-muted-foreground">
              แผน: <span className="text-foreground">{version.name}</span> (v
              {version.version_number})
            </span>
          ) : (
            <span className="text-muted-foreground">ยังไม่มีแผนที่ active</span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label="เวลาเป้าหมาย"
          value={`${summary.targetMinutes} นาที`}
          hint={`${(summary.targetMinutes / 60).toFixed(1)} ชม.`}
        />
        <Stat
          label="เวลาจริง"
          value={`${summary.actualMinutes} นาที`}
          hint={
            summary.time.overMinutes > 0
              ? `เกินเป้า ${summary.time.overMinutes} นาที`
              : `${(summary.actualMinutes / 60).toFixed(1)} ชม.`
          }
        />
        <Stat label="Time completion" value={`${summary.time.percent}%`} />
        <Stat
          label="Task completion"
          value={`${summary.taskCompletionPercent}%`}
          hint={`${summary.completedItems}/${summary.totalItems} งาน`}
        />
        <Stat
          label="Weighted completion"
          value={`${summary.weightedCompletionPercent}%`}
        />
        <Stat label="งานค้าง" value={summary.pendingItems} />
        <Stat
          label="ทบทวนถึงกำหนด"
          value={dueReviewCount}
          hint={dueReviewCount > 0 ? "ไปที่หน้าทบทวน" : "ไม่มีค้าง"}
        />
        <Stat
          label="Nap เป้าหมาย"
          value={`${workspace.nap_target_min}–${workspace.nap_target_max} นาที`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>ความคืบหน้าเวลาวันนี้</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={summary.time.percent} />
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.actualMinutes} / {summary.targetMinutes} นาที (
            {summary.time.percent}%)
            {summary.time.overMinutes > 0
              ? ` · เกินเป้า ${summary.time.overMinutes} นาที`
              : ""}
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          ตารางวันนี้
        </h2>
        {items.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการสำหรับวันนี้"
            description={
              version
                ? "แผนที่ active ไม่มีงานในวันนี้ หรือยังไม่ได้ import ตารางสำหรับวันนี้"
                : "ยังไม่มีแผนที่ active — นำเข้าและเปิดใช้แผน"
            }
            action={
              <Link href="/imports">
                <Button variant="outline">นำเข้าแผน</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((row) => (
              <ItemRow key={row.item.id} row={row} date={date} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
