"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus, Sparkles } from "lucide-react";
import type { Workspace, ReviewTask } from "@/types/db";
import type { QueuePlanItem, TodayStudyQueue } from "@/features/today/data";
import { timeCompletion } from "@/lib/calculations";
import { formatDateKeyThai } from "@/lib/dates";
import { Stat, EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemRow } from "./item-row";
import { ReviewItem } from "@/features/reviews/review-item";
import {
  CustomStudyCard,
  type CustomStudyWithSessions,
} from "@/features/custom-study/custom-study-card";
import { CustomStudyDialog } from "@/features/custom-study/custom-study-dialog";

export function TodayView({
  workspace,
  date,
  queue,
}: {
  workspace: Workspace;
  date: string;
  queue: TodayStudyQueue;
}) {
  const [openAddCustom, setOpenAddCustom] = useState(false);
  const summary = queue.summary;

  const targetMinutes =
    summary.plannedTargetMinutes > 0
      ? summary.plannedTargetMinutes
      : workspace.daily_target_minutes;

  const dailyTime = timeCompletion(summary.actualMinutesToday, targetMinutes);
  const remainingMinutesToday = Math.max(
    0,
    targetMinutes - summary.actualMinutesToday
  );

  const hasAnyContent =
    queue.current !== null ||
    queue.upcoming.length > 0 ||
    queue.customStudy.length > 0 ||
    queue.supplementary.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">วันนี้ · ลำดับการเรียน</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateKeyThai(date, { buddhist: true })} · {workspace.timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => setOpenAddCustom(true)}
            className="shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            เพิ่มการเรียนเอง
          </Button>

          <div className="text-right text-sm">
            {queue.version ? (
              <span className="text-muted-foreground">
                แผน:{" "}
                <span className="font-medium text-foreground">
                  {queue.version.name}
                </span>{" "}
                (v{queue.version.version_number})
              </span>
            ) : (
              <span className="text-muted-foreground">ยังไม่มีแผนที่ active</span>
            )}
          </div>
        </div>
      </header>

      {/* Progress & Target Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="เป้าหมายเวลาวันนี้"
          value={`${targetMinutes} นาที`}
          hint={
            remainingMinutesToday === 0
              ? "ครบเป้าหมายวันนี้แล้ว"
              : `เหลืออีก ${remainingMinutesToday} นาที`
          }
        />
        <Stat
          label="เวลาเรียนแล้ววันนี้"
          value={`${summary.actualMinutesToday} นาที`}
          hint={
            summary.actualMinutesToday > targetMinutes
              ? `เกินเป้า ${summary.actualMinutesToday - targetMinutes} นาที`
              : `${dailyTime.percent}% ของเป้าหมาย`
          }
        />
        <Stat
          label="ความคืบหน้าแผนรวม"
          value={`${summary.completedItems}/${summary.totalItems}`}
          hint={`${summary.planProgressPercent}% ของแผนทั้งหมด`}
        />
        <Stat
          label="Sessions วันนี้"
          value={summary.sessionCountToday}
          hint="บันทึกเวลาจริงวันนี้"
        />
        <Stat
          label="Nap เป้าหมาย"
          value={`${workspace.nap_target_min}–${workspace.nap_target_max} นาที`}
        />
      </section>

      {/* Daily Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {remainingMinutesToday === 0
              ? "ความคืบหน้าวันนี้ — ครบเป้าหมายแล้ว 🎉 (ยังเรียนต่อได้)"
              : "ความคืบหน้าเวลาวันนี้"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={dailyTime.percent} />
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.actualMinutesToday} / {targetMinutes} นาที (
            {dailyTime.rawPercent}%)
            {summary.actualMinutesToday > targetMinutes
              ? ` · เกินเป้าหมาย ${summary.actualMinutesToday - targetMinutes} นาที`
              : remainingMinutesToday > 0
                ? ` · เหลืออีกประมาณ ${remainingMinutesToday} นาที`
                : ""}
          </p>
        </CardContent>
      </Card>

      {!hasAnyContent ? (
        <EmptyState
          title={
            queue.queueState === "completed"
              ? "เรียนจบแผนการเรียนทั้งหมดแล้ว 🎉"
              : "ยังไม่มีรายการในคิวการเรียน"
          }
          description={
            queue.queueState === "completed"
              ? "คุณเรียนครบทุกรายการในแผนการเรียนที่ active เรียบร้อยแล้ว ยอดเยี่ยมมาก!"
              : queue.version
                ? "ยังไม่มีรายการที่ต้องเรียน สามารถกดเพิ่มการเรียนเองสำหรับวันนี้ได้"
                : "ยังไม่มีแผนที่ active — กรุณานำเข้าและเปิดใช้แผนการเรียน"
          }
          action={
            <div className="flex gap-2">
              <Button onClick={() => setOpenAddCustom(true)}>
                <Plus className="h-4 w-4 mr-1" />
                เพิ่มการเรียนเอง
              </Button>
              <Link href="/imports">
                <Button variant="outline">นำเข้าแผน</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Hero Section: ควรเรียนต่อ */}
          {queue.current ? (
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    ควรเรียนต่อ
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    รายการที่ต้องเรียนถัดไปตามลำดับความคืบหน้าของแผน
                  </p>
                </div>
              </div>
              <ItemRow
                row={queue.current}
                date={date}
                orderIndex={queue.current.item.order_index}
                prerequisiteStatus={queue.current.prerequisiteStatus}
                isHero={true}
              />
            </section>
          ) : queue.queueState === "completed" ? (
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="font-semibold text-sm text-emerald-800 dark:text-emerald-200">
                    เรียนครบทุกรายการในแผนแล้ว
                  </h3>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                    คุณทำภารกิจในแผนการเรียนนี้เสร็จสิ้นแล้ว สามารถทบทวนหรือเพิ่มการเรียนเสริมได้
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Section: ถัดไป (Upcoming in Queue) */}
          {queue.upcoming.length > 0 ? (
            <section>
              <div className="mb-2.5">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  ถัดไป ({queue.upcoming.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  ลำดับถัดไปในแผนการเรียน สามารถกดเรียนล่วงหน้าได้ทันที
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {queue.upcoming.map((row) => (
                  <ItemRow
                    key={row.item.id}
                    row={row}
                    date={date}
                    orderIndex={row.item.order_index}
                    prerequisiteStatus={row.prerequisiteStatus}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Custom Study Section (การเรียนเสริมวันนี้) */}
          <CustomStudySection
            items={queue.customStudy}
            date={date}
            onAdd={() => setOpenAddCustom(true)}
          />

          {/* Review Tasks Section */}
          <ReviewSection reviews={queue.supplementary} />
        </div>
      )}

      {/* Add Custom Study Dialog */}
      <CustomStudyDialog
        open={openAddCustom}
        onOpenChange={setOpenAddCustom}
        date={date}
      />
    </div>
  );
}

function CustomStudySection({
  items,
  date,
  onAdd,
}: {
  items: CustomStudyWithSessions[];
  date: string;
  onAdd: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">
            การเรียนเสริมวันนี้ ({items.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            รายการที่เพิ่มเองเฉพาะวันนี้ (คลิป/เว็บ/เอกสารภายนอก)
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          เพิ่มอีก
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((data) => (
          <CustomStudyCard key={data.item.id} data={data} date={date} />
        ))}
      </div>
    </section>
  );
}

function ReviewSection({ reviews }: { reviews: ReviewTask[] }) {
  if (reviews.length === 0) return null;

  return (
    <section>
      <div className="mb-2.5">
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
