import Link from "next/link";
import type { Workspace, ReviewTask } from "@/types/db";
import type { QueuePlanItem, TodayStudyQueue } from "@/features/today/data";
import { timeCompletion } from "@/lib/calculations";
import { formatDateKeyThai } from "@/lib/dates";
import { Stat, EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemRow } from "./item-row";
import { ReviewItem } from "@/features/reviews/review-item";

export function TodayView({
  workspace,
  date,
  queue,
}: {
  workspace: Workspace;
  date: string;
  queue: TodayStudyQueue;
}) {
  const summary = queue.summary;
  const time = timeCompletion(
    summary.actualMinutesToday,
    summary.plannedTargetMinutes
  );
  const hasQueue =
    queue.overdue.length > 0 ||
    queue.today.length > 0 ||
    queue.supplementary.length > 0 ||
    queue.next.length > 0;

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
          {queue.version ? (
            <span className="text-muted-foreground">
              แผน: <span className="text-foreground">{queue.version.name}</span> (v
              {queue.version.version_number})
            </span>
          ) : (
            <span className="text-muted-foreground">ยังไม่มีแผนที่ active</span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label="เวลาเป้าหมาย"
          value={`${summary.plannedTargetMinutes} นาที`}
          hint="เป้าหมาย ไม่ใช่ hard limit"
        />
        <Stat
          label="เวลาจริงวันนี้"
          value={`${summary.actualMinutesToday} นาที`}
          hint={
            summary.overTargetMinutes > 0
              ? `เกินเป้า ${summary.overTargetMinutes} นาที`
              : `เหลือประมาณ ${summary.remainingTargetMinutes} นาที`
          }
        />
        <Stat
          label="งานวันนี้"
          value={`${summary.todayCompletedItems}/${summary.todayTotalItems}`}
          hint="นับตาม planned date วันนี้"
        />
        <Stat label="งานค้าง" value={queue.overdue.length} />
        <Stat
          label="ทบทวนถึงกำหนด"
          value={queue.supplementary.length}
          hint={queue.supplementary.length > 0 ? "เลือกทำได้ทันที" : "ไม่มีค้าง"}
        />
        <Stat
          label="เรียนต่อได้"
          value={queue.next.length}
          hint="รายการจริงจากแผนถัดไป"
        />
        <Stat
          label="Sessions วันนี้"
          value={summary.sessionCountToday}
          hint="นับจาก actual date"
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
          <Progress value={time.percent} />
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.actualMinutesToday} / {summary.plannedTargetMinutes} นาที (
            {time.rawPercent}%)
            {summary.overTargetMinutes > 0
              ? ` · เกินเป้า ${summary.overTargetMinutes} นาที`
              : summary.remainingTargetMinutes > 0
                ? ` · เหลืออีกประมาณ ${summary.remainingTargetMinutes} นาที`
                : ""}
          </p>
        </CardContent>
      </Card>

      {!hasQueue ? (
        <EmptyState
          title="ยังไม่มีรายการเรียนสำหรับวันนี้"
          description={
            queue.version
              ? "ยังไม่มีงานค้าง งานวันนี้ งานทบทวน หรือรายการเรียนต่อจากแผน"
              : "ยังไม่มีแผนที่ active — นำเข้าและเปิดใช้แผน"
          }
          action={
            <Link href="/imports">
              <Button variant="outline">นำเข้าแผน</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          <QueueSection
            title="งานค้าง"
            description="planned date ยังเป็นวันเดิม แต่เรียนจริงวันนี้ได้"
            items={queue.overdue}
            date={date}
          />
          <QueueSection
            title="วันนี้"
            description="รายการที่ planned date ตรงกับวันนี้"
            items={queue.today}
            date={date}
          />
          <ReviewSection reviews={queue.supplementary} />
          <QueueSection
            title="เรียนต่อได้"
            description="รายการถัดไปจากแผนจริง ใช้เมื่อยังมีเวลาและอยากเรียนล่วงหน้า"
            items={queue.next}
            date={date}
          />
        </div>
      )}
    </div>
  );
}

function QueueSection({
  title,
  description,
  items,
  date,
}: {
  title: string;
  description: string;
  items: QueuePlanItem[];
  date: string;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {title} ({items.length})
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((row) => (
          <ItemRow key={row.item.id} row={row} date={date} />
        ))}
      </div>
    </section>
  );
}

function ReviewSection({ reviews }: { reviews: ReviewTask[] }) {
  if (reviews.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          ทบทวน ({reviews.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          งานทบทวน active ที่ถึงกำหนดแล้ว
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
