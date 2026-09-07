"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
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
import { Button } from "@/components/ui/button";
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
import { lessonRangeText, planItemTopic, topicIsSubject } from "@/lib/plans/topic";
import { shouldShowLearningResource } from "@/lib/plans/resource-policy";
import type { StudyResource } from "@/lib/resources/types";
import { ResourceGrid } from "@/features/resources/resource-grid";

const PRIORITY_LABEL: Record<string, string> = {
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
};

const ASSESSMENT_TYPES = new Set(["diagnostic", "quiz", "exercise", "mock"]);

export type StudyItemData = ResolvedPlanItem & {
  executionState?: ExecutionState;
  resources?: StudyResource[];
};

/**
 * One study item on /today: a full-width summary with its controls, then the
 * paid and free resource lanes side by side underneath.
 *
 * The lanes are siblings of the summary card, not nested inside it, so a
 * resource card gets the whole half-width instead of a box within a box.
 */
export function StudyItemCard({
  row,
  date,
  orderIndex,
  prerequisiteStatus,
  isHero = false,
  showResources = true,
}: {
  row: StudyItemData;
  date: string;
  orderIndex?: number;
  prerequisiteStatus?: PrerequisiteCheckResult;
  isHero?: boolean;
  /** Off where the caller does not load resources (e.g. /history), so empty
      lanes never imply a topic has no sources. */
  showResources?: boolean;
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
  const resources = row.resources ?? [];
  const topic = planItemTopic(item);
  const lessonRange = lessonRangeText(item);
  const isSkipped = row.status === "skipped";
  const isBlocked = Boolean(prerequisiteStatus?.isBlocked);
  // Curated-resource subjects still flag a topic that has no source at all.
  const showMissingResourceWarning =
    showResources &&
    shouldShowLearningResource(item.subject) &&
    resources.length === 0;

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
    <section className="flex flex-col gap-4">
      {/* Summary + controls, full width */}
      <div
        className={`rounded-xl border bg-card p-5 shadow-sm ${
          isHero
            ? "border-primary/60 bg-primary/[0.03]"
            : isStudying
              ? "border-primary/40"
              : "border-border"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {displayOrder !== undefined ? (
                <span
                  className={`rounded px-2 py-0.5 font-semibold tabular-nums ${
                    isHero
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  ลำดับที่ {displayOrder}
                </span>
              ) : null}
              {topicIsSubject(item) ? null : (
                <span>{subjectLabel(item.subject)}</span>
              )}
              <span aria-hidden="true">·</span>
              <span>{activityLabel(item.activity_type)}</span>
              <span aria-hidden="true">·</span>
              <span>
                ความสำคัญ{PRIORITY_LABEL[item.priority] ?? item.priority} (
                {PRIORITY_WEIGHT[item.priority]})
              </span>
            </div>

            {/* The topic leads; course codes live on the resource cards. */}
            <h3
              className={`mt-2 line-clamp-2 break-words font-semibold leading-snug ${
                isHero ? "text-xl" : "text-lg"
              }`}
            >
              {topic}
            </h3>

            {item.instructions && topic !== item.instructions.trim() ? (
              <p className="mt-1.5 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
                {item.instructions}
              </p>
            ) : null}

            {lessonRange ? (
              <p className="mt-1 text-xs text-muted-foreground">{lessonRange}</p>
            ) : null}
          </div>

          <Badge className={`shrink-0 ${EXECUTION_STATE_CLASS[executionState]}`}>
            {EXECUTION_STATE_LABELS[executionState]}
          </Badge>
        </div>

        {isBlocked && prerequisiteStatus?.reason ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{prerequisiteStatus.reason}</span>
          </div>
        ) : null}

        {showMissingResourceWarning ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ยังไม่ได้กำหนดแหล่งเรียนสำหรับหัวข้อนี้
          </p>
        ) : null}

        <StudyProgress
          actualMinutes={row.actualMinutes}
          targetMinutes={item.target_minutes}
          percent={timeProgress.percent}
        />

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={pending || isBlocked || isSkipped}
            onClick={handleStudyNow}
            title={
              isBlocked
                ? prerequisiteStatus?.reason
                : "เริ่มเรียนรายการนี้และบันทึกเวลาเรียนทันที"
            }
            variant={isStudying ? "secondary" : "default"}
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            {isStudying ? "กำลังเรียนอยู่" : "เรียนตอนนี้"}
          </Button>

          <Button
            variant="secondary"
            disabled={pending || isBlocked}
            onClick={() => changeStatus("studying")}
            title="เริ่มเรียนหรือเรียนต่อ"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {row.status === "not_started" ? "เริ่มเรียน" : "เรียนต่อ"}
          </Button>

          {row.status === "studying" ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus("paused")}
              title="พัก"
            >
              <Pause className="h-4 w-4" aria-hidden="true" />
              พัก
            </Button>
          ) : null}

          <Button
            variant="outline"
            disabled={pending}
            onClick={() => changeStatus("completed")}
            title="ทำรายการนี้เสร็จแล้ว"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            เรียนเสร็จ
          </Button>

          <Button
            variant="outline"
            onClick={() => setOpenTime((v) => !v)}
            title="เพิ่มเวลาเรียนจริง"
            aria-expanded={openTime}
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            เพิ่มเวลา
          </Button>

          <Button
            variant="ghost"
            onClick={() => setOpenMore((v) => !v)}
            title="เปิดเมนูเพิ่มเติม"
            aria-label="เมนูเพิ่มเติม"
            aria-expanded={openMore}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Secondary: today's logged intervals. */}
        {row.sessions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.sessions.map((session) => (
              <span
                key={session.id}
                className="rounded bg-muted/70 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              >
                {session.start_time}–{session.end_time} (
                {session.duration_minutes}น.)
              </span>
            ))}
          </div>
        ) : null}

        {openMore ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
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
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isSkipped ? "เลิกข้าม" : "ข้าม"}
            </Button>
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
              aria-expanded={openDetails}
            >
              รายละเอียดแผน
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenHistory((v) => !v)}
              aria-expanded={openHistory}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              ประวัติการเรียน
            </Button>
          </div>
        ) : null}

        {openDetails ? (
          <div className="mt-4 rounded-lg border border-border p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <Detail label="หัวข้อ" value={topic} />
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
      </div>

      {/* Learning resources: two full lanes, not a nested mini-grid. */}
      {showResources ? (
        <ResourceGrid planItemId={item.id} resources={resources} today={date} />
      ) : null}
    </section>
  );
}

function StudyProgress({
  actualMinutes,
  targetMinutes,
  percent,
}: {
  actualMinutes: number;
  targetMinutes: number;
  percent: number;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">ความคืบหน้า</span>
        <span className="font-medium tabular-nums">
          {actualMinutes} / {targetMinutes} นาที ({percent}%)
        </span>
      </div>
      <Progress value={percent} />
    </div>
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
