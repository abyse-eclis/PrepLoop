"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  ExternalLink,
  History,
  MoreHorizontal,
  Pause,
  Play,
  SkipForward,
  Undo2,
} from "lucide-react";
import type { ResolvedPlanItem } from "@/features/plans/data";
import { subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/status";
import { Badge } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setItemStatus } from "@/features/sessions/actions";
import { AddTimeForm } from "@/features/sessions/add-time-form";
import { SessionHistoryPanel } from "@/features/sessions/session-history";
import type { PlanItemStatus } from "@/lib/schemas/common";
import { PRIORITY_WEIGHT } from "@/lib/calculations";
import {
  deriveExecutionState,
  EXECUTION_STATE_CLASS,
  EXECUTION_STATE_LABELS,
  type ExecutionState,
} from "@/lib/study-execution";
import { formatDateKeyThai } from "@/lib/dates";
import { carryOverDayLabel } from "@/lib/carryover";
import { getPlanItemResource } from "@/lib/plans/resource";

const PRIORITY_LABEL: Record<string, string> = {
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
};

const ASSESSMENT_TYPES = new Set(["diagnostic", "quiz", "exercise", "mock"]);

type ItemRowData = ResolvedPlanItem & { executionState?: ExecutionState };

/** Carry-over context, present only when the row is shown on a later day. */
export interface ItemRowCarryOver {
  daysLate: number;
  remainingMinutes: number;
}

export function ItemRow({
  row,
  date,
  carryOver,
}: {
  row: ItemRowData;
  date: string;
  carryOver?: ItemRowCarryOver;
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

  const isAssessment = ASSESSMENT_TYPES.has(item.activity_type);
  const resource = getPlanItemResource(item);
  const isSkipped = row.status === "skipped";
  // Skipping is the escape hatch for a shifted schedule: the item leaves the
  // backlog and the stats denominator, and "เลิกข้าม" puts it straight back.
  const skipButton = (
    <Button
      size="sm"
      variant={isSkipped ? "secondary" : "outline"}
      disabled={pending}
      onClick={() => changeStatus(isSkipped ? "not_started" : "skipped")}
      title={
        isSkipped
          ? "เอากลับมาเรียนตามเดิม"
          : "ข้ามรายการนี้ ไม่ต้องเรียนแล้ว (ไม่นับเป็นงานค้างและไม่ตัดคะแนน)"
      }
    >
      {isSkipped ? (
        <Undo2 className="h-3.5 w-3.5" />
      ) : (
        <SkipForward className="h-3.5 w-3.5" />
      )}
      {isSkipped ? "เลิกข้าม" : "ข้าม / ไม่เรียนแล้ว"}
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

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{subjectLabel(item.subject)}</span>
              {item.course_code ? (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                  {item.course_code}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {activityLabel(item.activity_type)}
              </span>
              <span className="text-xs text-muted-foreground">
                · ความสำคัญ {PRIORITY_LABEL[item.priority]} (
                {PRIORITY_WEIGHT[item.priority]})
              </span>
            </div>
            {item.lesson_from ? (
              <p className="mt-1 text-xs text-muted-foreground">
                คลิป {item.lesson_from}
                {item.lesson_to && item.lesson_to !== item.lesson_from
                  ? `–${item.lesson_to}`
                  : ""}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              planned date: {formatDateKeyThai(item.date, { buddhist: true })}
              {item.date !== date
                ? ` · เรียนจริงวันนี้: ${formatDateKeyThai(date, {
                    buddhist: true,
                  })}`
                : ""}
            </p>
            {carryOver ? (
              <p className="mt-1 text-xs text-muted-foreground">
                ยกมาจากวันก่อน · {carryOverDayLabel(carryOver.daysLate)} ·
                เวลาที่กรอกจะบันทึกเป็นวันนี้ (นับเป็นเรียนย้อนหลัง)
              </p>
            ) : null}
            {item.instructions ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {item.instructions}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <div className="flex flex-wrap justify-end gap-1.5">
              {carryOver ? (
                <Badge className="status-incomplete">
                  {carryOverDayLabel(carryOver.daysLate)}
                </Badge>
              ) : null}
              <Badge className={EXECUTION_STATE_CLASS[executionState]}>
                {EXECUTION_STATE_LABELS[executionState]}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {row.actualMinutes}/{item.target_minutes} นาที
              {carryOver && carryOver.remainingMinutes > 0
                ? ` · ค้างอีก ${carryOver.remainingMinutes} นาที`
                : ""}
            </div>
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

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => changeStatus("studying")}
            title="เริ่มเรียนหรือเรียนต่อ"
          >
            <Play className="h-3.5 w-3.5" />
            {row.status === "not_started" ? "เริ่มเรียน" : "เรียนต่อ"}
          </Button>
          {row.status === "studying" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus("paused")}
              title="พัก"
            >
              <Pause className="h-3.5 w-3.5" />
              พัก
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={pending}
            onClick={() => changeStatus("completed")}
            title="ทำรายการนี้เสร็จแล้ว"
          >
            <Check className="h-3.5 w-3.5" />
            เรียนเสร็จ
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenTime((v) => !v)}
            title="เพิ่มเวลาเรียนจริง"
          >
            <Clock className="h-3.5 w-3.5" />
            เพิ่มเวลา
          </Button>
          {carryOver || isSkipped ? skipButton : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpenMore((v) => !v)}
            title="เปิดเมนูเพิ่มเติม"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            เพิ่มเติม
          </Button>
        </div>

        {openMore ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {carryOver || isSkipped ? null : skipButton}
            {isAssessment ? (
              <Link href={`/assessments?item=${item.id}`}>
                <Button size="sm" variant="outline">
                  กรอกผล
                </Button>
              </Link>
            ) : null}
            {resource ? (
              <span className="flex flex-wrap items-center gap-2">
                {resource.sourceName ? (
                  <span className="text-xs text-muted-foreground">
                    {resource.sourceName}
                  </span>
                ) : null}
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${resource.label}สำหรับ ${subjectLabel(item.subject)}${resource.sourceName ? ` จาก ${resource.sourceName}` : ""}`}
                  title={resource.tooltip}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {resource.label}
                </a>
              </span>
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
              <History className="h-3.5 w-3.5" />
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
              <Detail
                label="planned date"
                value={formatDateKeyThai(item.date, { buddhist: true })}
              />
              <Detail label="target" value={`${item.target_minutes} นาที`} />
              <Detail
                label="priority"
                value={PRIORITY_LABEL[item.priority] ?? item.priority}
              />
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
