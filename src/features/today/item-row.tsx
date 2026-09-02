"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  ExternalLink,
  History,
  MoreHorizontal,
  Pause,
  Play,
  SkipForward,
  Undo2,
  Zap,
} from "lucide-react";
import type { ResolvedPlanItem } from "@/features/plans/data";
import { subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/status";
import { Badge, Progress } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setItemStatus } from "@/features/sessions/actions";
import { studyNow } from "@/features/today/actions";
import { AddTimeForm } from "@/features/sessions/add-time-form";
import { SessionHistoryPanel } from "@/features/sessions/session-history";
import type { PlanItemStatus } from "@/lib/schemas/common";
import { PRIORITY_WEIGHT, timeCompletion } from "@/lib/calculations";
import {
  deriveExecutionState,
  EXECUTION_STATE_CLASS,
  EXECUTION_STATE_LABELS,
  type ExecutionState,
} from "@/lib/study-execution";
import type { PrerequisiteCheckResult } from "@/lib/execution-order";
import { formatDateKeyThai } from "@/lib/dates";
import { getPlanItemResource } from "@/lib/plans/resource";

const PRIORITY_LABEL: Record<string, string> = {
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
};

const ASSESSMENT_TYPES = new Set(["diagnostic", "quiz", "exercise", "mock"]);

type ItemRowData = ResolvedPlanItem & { executionState?: ExecutionState };

export function ItemRow({
  row,
  date,
  orderIndex,
  prerequisiteStatus,
  isHero = false,
}: {
  row: ItemRowData;
  date: string;
  orderIndex?: number;
  prerequisiteStatus?: PrerequisiteCheckResult;
  isHero?: boolean;
}) {
  const { item } = row;
  const [openTime, setOpenTime] = useState(false);
  const [openMore, setOpenMore] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(status: PlanItemStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setItemStatus({ planItemId: item.id, status });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  function handleStudyNow() {
    setError(null);
    startTransition(async () => {
      const res = await studyNow({ planItemId: item.id, date });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาดในการเริ่มเรียน");
    });
  }

  const isAssessment = ASSESSMENT_TYPES.has(item.activity_type);
  const resource = getPlanItemResource(item);
  const isSkipped = row.status === "skipped";
  const isBlocked = Boolean(prerequisiteStatus?.isBlocked);

  const skipButton = (
    <Button
      size="sm"
      variant={isSkipped ? "secondary" : "outline"}
      disabled={pending}
      onClick={() => changeStatus(isSkipped ? "not_started" : "skipped")}
      title={
        isSkipped
          ? "เอากลับมาเรียนตามเดิม"
          : "ข้ามรายการนี้ ไม่ต้องเรียนแล้ว"
      }
    >
      {isSkipped ? (
        <Undo2 className="h-3.5 w-3.5 mr-1" />
      ) : (
        <SkipForward className="h-3.5 w-3.5 mr-1" />
      )}
      {isSkipped ? "เลิกข้าม" : "ข้าม"}
    </Button>
  );

  const executionState =
    row.executionState ??
    deriveExecutionState({
      plannedDate: item.date,
      today: date,
      status: row.status,
      sessions: row.sessions,
      targetMinutes: item.target_minutes,
    });

  const isStudying =
    row.status === "studying" || executionState === "in_progress";
  const displayOrder = orderIndex ?? item.order_index;
  const timeProgress = timeCompletion(row.actualMinutes, item.target_minutes);

  return (
    <Card
      className={`${
        isHero
          ? "border-primary/70 shadow-md ring-2 ring-primary/20 bg-card"
          : isStudying
            ? "border-primary/60 shadow-sm ring-1 ring-primary/20"
            : ""
      }`}
    >
      <CardContent className={isHero ? "pt-5 pb-5" : "pt-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {displayOrder !== undefined ? (
                <span
                  className={`font-bold tabular-nums text-xs px-2 py-0.5 rounded ${
                    isHero
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  ลำดับที่ {displayOrder}
                </span>
              ) : null}

              <span className="font-semibold text-base">
                {subjectLabel(item.subject)}
              </span>

              {item.course_code ? (
                <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {item.course_code}
                </span>
              ) : null}

              <span className="text-xs text-muted-foreground">
                {activityLabel(item.activity_type)}
              </span>

              <span className="text-xs text-muted-foreground">
                · ความสำคัญ {PRIORITY_LABEL[item.priority] ?? item.priority} (
                {PRIORITY_WEIGHT[item.priority]})
              </span>
            </div>

            {item.lesson_from ? (
              <p className="mt-1.5 text-sm font-medium text-foreground">
                คลิป {item.lesson_from}
                {item.lesson_to && item.lesson_to !== item.lesson_from
                  ? `–${item.lesson_to}`
                  : ""}
              </p>
            ) : null}

            {item.instructions ? (
              <p className="mt-1 text-sm text-muted-foreground break-words">
                {item.instructions}
              </p>
            ) : null}

            {/* Prerequisite warning banner */}
            {isBlocked && prerequisiteStatus?.reason ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{prerequisiteStatus.reason}</span>
              </div>
            ) : null}

            {/* Progress bar for Hero item */}
            {isHero ? (
              <div className="mt-3 max-w-md">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>ความคืบหน้า</span>
                  <span className="font-medium">
                    {row.actualMinutes} / {item.target_minutes} นาที (
                    {timeProgress.percent}%)
                  </span>
                </div>
                <Progress value={timeProgress.percent} />
              </div>
            ) : null}
          </div>

          <div className="text-right">
            <div className="flex flex-wrap justify-end gap-1.5">
              <Badge className={EXECUTION_STATE_CLASS[executionState]}>
                {EXECUTION_STATE_LABELS[executionState]}
              </Badge>
            </div>
            {!isHero ? (
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {row.actualMinutes}/{item.target_minutes} นาที
              </div>
            ) : null}
          </div>
        </div>

        {row.sessions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.sessions.map((s) => (
              <span
                key={s.id}
                className="rounded bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
              >
                {s.start_time}–{s.end_time} ({s.duration_minutes}น.)
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {/* "เรียนตอนนี้" (Study Now) button */}
          <Button
            size={isHero ? "default" : "sm"}
            variant={isStudying ? "secondary" : "default"}
            disabled={pending || isBlocked || isSkipped}
            onClick={handleStudyNow}
            title={
              isBlocked
                ? prerequisiteStatus?.reason
                : "เริ่มเรียนรายการนี้และบันทึกเวลาเรียนทันที"
            }
          >
            <Zap className="h-4 w-4 mr-1" />
            {isStudying
              ? "กำลังเรียนอยู่"
              : isHero
                ? "เรียนตอนนี้"
                : "เรียนตอนนี้"}
          </Button>

          <Button
            size={isHero ? "default" : "sm"}
            variant="secondary"
            disabled={pending || isBlocked}
            onClick={() => changeStatus("studying")}
            title="เริ่มเรียนหรือเรียนต่อ"
          >
            <Play className="h-4 w-4 mr-1" />
            {row.status === "not_started" ? "เริ่มเรียน" : "เรียนต่อ"}
          </Button>

          {row.status === "studying" ? (
            <Button
              size={isHero ? "default" : "sm"}
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus("paused")}
              title="พัก"
            >
              <Pause className="h-4 w-4 mr-1" />
              พัก
            </Button>
          ) : null}

          <Button
            size={isHero ? "default" : "sm"}
            variant="outline"
            disabled={pending}
            onClick={() => changeStatus("completed")}
            title="ทำรายการนี้เสร็จแล้ว"
          >
            <Check className="h-4 w-4 mr-1" />
            เรียนเสร็จ
          </Button>

          <Button
            size={isHero ? "default" : "sm"}
            variant="outline"
            onClick={() => setOpenTime((v) => !v)}
            title="เพิ่มเวลาเรียนจริง"
          >
            <Clock className="h-4 w-4 mr-1" />
            เพิ่มเวลา
          </Button>

          {resource ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: "outline",
                size: isHero ? "default" : "sm",
              })}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
              {resource.label}
            </a>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded border border-dashed border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400"
              title="รายการนี้ยังไม่ได้กำหนดลิงก์แหล่งเรียนหรือวิดีโอ"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ยังไม่ได้กำหนดแหล่งเรียน
            </span>
          )}

          <Button
            size={isHero ? "default" : "sm"}
            variant="ghost"
            onClick={() => setOpenMore((v) => !v)}
            title="เปิดเมนูเพิ่มเติม"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {openMore ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {skipButton}
            {isAssessment ? (
              <Link href={`/assessments?item=${item.id}`}>
                <Button size="sm" variant="outline">
                  กรอกผลสอบ
                </Button>
              </Link>
            ) : null}
            <Link href={`/plan?item=${item.stable_external_id}`}>
              <Button size="sm" variant="ghost">
                ดูในหน้าแผน
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenDetails((v) => !v)}
            >
              รายละเอียดแผน
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenHistory((v) => !v)}
            >
              <History className="h-3.5 w-3.5 mr-1" />
              ประวัติการเรียน
            </Button>
          </div>
        ) : null}

        {openDetails ? (
          <div className="mt-4 rounded-md border border-border p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <Detail label="วิชา" value={item.subject} />
              <Detail label="คอร์ส" value={item.course_code ?? "-"} />
              <Detail
                label="บท/คลิป"
                value={
                  item.lesson_from
                    ? item.lesson_to && item.lesson_to !== item.lesson_from
                      ? `${item.lesson_from}–${item.lesson_to}`
                      : item.lesson_from
                    : "-"
                }
              />
              <Detail label="กิจกรรม" value={activityLabel(item.activity_type)} />
              <Detail label="เป้าหมาย" value={`${item.target_minutes} นาที`} />
              <Detail
                label="ความสำคัญ"
                value={PRIORITY_LABEL[item.priority] ?? item.priority}
              />
              <Detail label="ลำดับในแผน" value={`#${item.order_index}`} />
              <Detail label="stable id" value={item.stable_external_id} />
            </div>
            {item.instructions ? (
              <p className="mt-3 text-muted-foreground">{item.instructions}</p>
            ) : null}
          </div>
        ) : null}

        {openHistory ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">ประวัติการเรียน</p>
            <SessionHistoryPanel sessions={row.sessions} item={item} />
          </div>
        ) : null}

        {openTime ? (
          <div className="mt-4 border-t border-border pt-4">
            <AddTimeForm
              planItemId={item.id}
              sessionDate={date}
              onDone={() => setOpenTime(false)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="break-words">{value}</p>
    </div>
  );
}
