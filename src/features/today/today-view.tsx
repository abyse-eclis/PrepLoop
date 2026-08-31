import Link from "next/link";
import type { Workspace, ReviewTask } from "@/types/db";
import type { QueuePlanItem, TodayStudyQueue } from "@/features/today/data";
import { timeCompletion } from "@/lib/calculations";
import { formatDateKeyThai } from "@/lib/dates";
import {
  carryOverDayLabel,
  type CarryOverGroup,
  type CarryOverSummary,
} from "@/lib/carryover";
import { Stat, EmptyState, Progress, Badge } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemRow } from "./item-row";
import { ReorderableQueue } from "./reorderable-queue";
import { SkipDayButton } from "./skip-day-button";
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
  const carryOver = queue.carryOver;
  const hasQueue =
    carryOver.itemCount > 0 ||
    queue.carryOverSkipped.length > 0 ||
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
          hint={
            summary.carryOverRemainingMinutes > 0
              ? `รวมงานค้างเป็น ${summary.totalWorkloadMinutes} นาที`
              : "เป้าหมาย ไม่ใช่ hard limit"
          }
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
        <Stat
          label="งานค้าง (เรียนย้อนหลัง)"
          value={carryOver.itemCount}
          hint={
            carryOver.itemCount > 0
              ? `${carryOverDayLabel(carryOver.maxDaysLate)} · ค้างอีก ${summary.carryOverRemainingMinutes} นาที`
              : summary.carryOverSkippedItems > 0
                ? `ไม่มีค้าง · ข้ามไว้ ${summary.carryOverSkippedItems} รายการ`
                : "ตามแผนครบทุกวัน"
          }
        />
        <Stat
          label="เรียนย้อนหลังวันนี้"
          value={`${summary.carryOverMinutesToday} นาที`}
          hint="เวลาที่ลงวันนี้ให้งานของวันก่อน"
        />
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
          {summary.carryOverRemainingMinutes > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              + งานค้างจากวันก่อนอีก {summary.carryOverRemainingMinutes} นาที ·
              รวมภาระวันนี้ {summary.totalWorkloadMinutes} นาที
              {summary.carryOverMinutesToday > 0
                ? ` · เรียนย้อนหลังไปแล้ว ${summary.carryOverMinutesToday} นาที`
                : ""}
            </p>
          ) : null}
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
          <CarryOverSection
            carryOver={carryOver}
            skipped={queue.carryOverSkipped}
            date={date}
          />
          <ReorderableQueue
            title="วันนี้"
            description="รายการที่ planned date ตรงกับวันนี้ สามารถจัดลำดับการเรียนและกดเรียนตอนนี้ได้ทันที"
            items={queue.today}
            date={date}
            hasCustomOrder={queue.hasCustomOrder}
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

/**
 * Unfinished work from earlier days, grouped by the day it was planned for.
 * planned date is never rewritten — studying it now is recorded on today's
 * date, which the item then reports as "เรียนย้อนหลังแล้ว".
 */
function CarryOverSection({
  carryOver,
  skipped,
  date,
}: {
  carryOver: CarryOverSummary<QueuePlanItem>;
  skipped: QueuePlanItem[];
  date: string;
}) {
  if (carryOver.itemCount === 0 && skipped.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          เรียนย้อนหลัง · งานค้าง ({carryOver.itemCount})
        </h2>
        <p className="text-xs text-muted-foreground">
          ของวันก่อนที่ยังไม่ครบ ยกมาแสดงวันนี้ · ค้างรวม{" "}
          {carryOver.remainingMinutes} นาที · planned date ยังเป็นวันเดิม
          เวลาที่กรอกจะถูกบันทึกเป็นวันนี้ · ถ้าตารางเปลี่ยนจนไม่ต้องเรียนแล้ว
          กด “ข้าม” ได้ (ไม่นับเป็นงานค้างและไม่ตัดคะแนน)
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {carryOver.groups.map((group) => (
          <CarryOverDay key={group.date} group={group} date={date} />
        ))}
      </div>
      <SkippedList items={skipped} date={date} />
    </section>
  );
}

/** Skipped items, collapsed — the only place on Today to undo a skip. */
function SkippedList({ items, date }: { items: QueuePlanItem[]; date: string }) {
  if (items.length === 0) return null;

  return (
    <details className="mt-4 rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">
        รายการที่ข้ามไว้ ({items.length}) · กดเพื่อดูและเลิกข้าม
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {items.map((row) => (
          <ItemRow key={row.item.id} row={row} date={date} />
        ))}
      </div>
    </details>
  );
}

function CarryOverDay({
  group,
  date,
}: {
  group: CarryOverGroup<QueuePlanItem>;
  date: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {formatDateKeyThai(group.date, { buddhist: true })}
        </span>
        <Badge className="status-incomplete">
          {carryOverDayLabel(group.daysLate)}
        </Badge>
        <span className="text-xs tabular-nums text-muted-foreground">
          {group.entries.length} รายการ · ค้างอีก {group.remainingMinutes} นาที
        </span>
        <SkipDayButton
          planItemIds={group.entries.map((entry) => entry.row.item.id)}
        />
      </div>
      <div className="flex flex-col gap-3">
        {group.entries.map((entry) => (
          <ItemRow
            key={entry.row.item.id}
            row={entry.row}
            date={date}
            carryOver={{
              daysLate: entry.daysLate,
              remainingMinutes: entry.remainingMinutes,
            }}
          />
        ))}
      </div>
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
