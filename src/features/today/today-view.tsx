"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import type { Workspace, ReviewTask } from "@/types/db";
import type { TodayStudyQueue } from "@/features/today/data";
import { timeCompletion } from "@/lib/calculations";
import { formatDateKeyThai } from "@/lib/dates";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildCourseLanes } from "@/lib/today/course-lanes";
import { CourseLaneGrid } from "./course-lane";
import { ReviewItem } from "@/features/reviews/review-item";
import {
  CustomStudyCard,
  type CustomStudyWithSessions,
} from "@/features/custom-study/custom-study-card";
import { CustomStudyDialog } from "@/features/custom-study/custom-study-dialog";

/**
 * Today is two learning streams: everything purchased on the left, everything
 * free on the right. The plan items behind them supply subject, topic and
 * timer state, but are not drawn as containers — each resource is its own card.
 */
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

  const lanes = useMemo(
    () =>
      buildCourseLanes(
        queue.current ? [queue.current, ...queue.upcoming] : queue.upcoming
      ),
    [queue]
  );

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
    lanes.total > 0 ||
    queue.customStudy.length > 0 ||
    queue.supplementary.length > 0;

  return (
    <div data-wide-page className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">วันนี้ · ลำดับการเรียน</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateKeyThai(date, { buddhist: true })} · {workspace.timezone}
            {lanes.total > 0 ? ` · ${lanes.total} รายการ` : ""}
            {queue.version ? ` · ${queue.version.name} (v${queue.version.version_number})` : " · ยังไม่มีแผนที่ active"}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpenAddCustom(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          เพิ่มการเรียนเอง
        </Button>
      </header>

      <TodaySummary
        targetMinutes={targetMinutes}
        actualMinutes={summary.actualMinutesToday}
        remainingMinutes={remainingMinutesToday}
        percent={dailyTime.percent}
        rawPercent={dailyTime.rawPercent}
        completedItems={summary.completedItems}
        totalItems={summary.totalItems}
        planProgressPercent={summary.planProgressPercent}
        sessionCountToday={summary.sessionCountToday}
        napMin={workspace.nap_target_min}
        napMax={workspace.nap_target_max}
      />

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
                <Plus className="h-4 w-4" aria-hidden="true" />
                เพิ่มการเรียนเอง
              </Button>
              <Link href="/imports">
                <Button variant="outline">นำเข้าแผน</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {lanes.total === 0 && queue.queueState === "completed" ? (
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="flex items-center gap-3 pb-5 pt-5">
                <CheckCircle2
                  className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    เรียนครบทุกรายการในแผนแล้ว
                  </h3>
                  <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                    คุณทำภารกิจในแผนการเรียนนี้เสร็จสิ้นแล้ว สามารถทบทวนหรือเพิ่มการเรียนเสริมได้
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <CourseLaneGrid
            paid={lanes.paid}
            free={lanes.free}
            other={lanes.other}
            date={date}
            today={date}
          />

          <CustomStudySection
            items={queue.customStudy}
            date={date}
            onAdd={() => setOpenAddCustom(true)}
          />

          <ReviewSection reviews={queue.supplementary} />
        </div>
      )}

      <CustomStudyDialog
        open={openAddCustom}
        onOpenChange={setOpenAddCustom}
        date={date}
      />
    </div>
  );
}

/** One compact strip instead of a stat grid — the lanes are the page. */
function TodaySummary({
  targetMinutes,
  actualMinutes,
  remainingMinutes,
  percent,
  rawPercent,
  completedItems,
  totalItems,
  planProgressPercent,
  sessionCountToday,
  napMin,
  napMax,
}: {
  targetMinutes: number;
  actualMinutes: number;
  remainingMinutes: number;
  percent: number;
  rawPercent: number;
  completedItems: number;
  totalItems: number;
  planProgressPercent: number;
  sessionCountToday: number;
  napMin: number;
  napMax: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div>
            <span className="text-sm text-muted-foreground">
              ความคืบหน้าวันนี้{" "}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {actualMinutes} / {targetMinutes} นาที
            </span>
            <span className="ml-1 text-sm text-muted-foreground tabular-nums">
              ({rawPercent}%)
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {remainingMinutes === 0
              ? "ครบเป้าหมายวันนี้แล้ว 🎉 (ยังเรียนต่อได้)"
              : `เหลืออีก ${remainingMinutes} นาที`}
            {" · "}แผนรวม {completedItems}/{totalItems} ({planProgressPercent}%)
            {" · "}วันนี้ {sessionCountToday} sessions
            {" · "}Nap {napMin}–{napMax} นาที
          </p>
        </div>
        <Progress value={percent} />
      </CardContent>
    </Card>
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
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
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
