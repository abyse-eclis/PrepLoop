import type { PlanItemStatus } from "@/lib/schemas/common";
import type { StudySession } from "@/types/db";

export type ExecutionState =
  | "not_started"
  | "in_progress"
  | "completed_on_time"
  | "completed_early"
  | "completed_late"
  | "overdue"
  | "paused"
  | "needs_review"
  | "recovery"
  | "cancelled";

export const EXECUTION_STATE_LABELS: Record<ExecutionState, string> = {
  not_started: "ยังไม่เริ่ม",
  in_progress: "กำลังเรียน",
  completed_on_time: "เสร็จตามแผน",
  completed_early: "เรียนล่วงหน้าแล้ว",
  completed_late: "เรียนย้อนหลังแล้ว",
  overdue: "งานค้าง",
  paused: "พัก",
  needs_review: "ต้องทบทวน",
  recovery: "Recovery",
  cancelled: "ยกเลิกตามแผนใหม่",
};

export const EXECUTION_STATE_CLASS: Record<ExecutionState, string> = {
  not_started: "status-not_started",
  in_progress: "status-studying",
  completed_on_time: "status-completed",
  completed_early: "status-completed",
  completed_late: "status-completed",
  overdue: "status-incomplete",
  paused: "status-paused",
  needs_review: "status-needs_review",
  recovery: "status-recovery",
  cancelled: "status-cancelled",
};

export function actualMinutesFromSessions(
  sessions: Pick<StudySession, "duration_minutes">[]
): number {
  return sessions.reduce((sum, s) => sum + Math.max(0, s.duration_minutes ?? 0), 0);
}

export function earliestActualDate(
  sessions: Pick<StudySession, "session_date">[]
): string | null {
  let earliest: string | null = null;
  for (const session of sessions) {
    if (!earliest || session.session_date < earliest) earliest = session.session_date;
  }
  return earliest;
}

export function isCompletedStatus(status: string | null | undefined): boolean {
  return status === "completed";
}

export function statusFromActualMinutes(
  actualMinutes: number,
  targetMinutes: number
): PlanItemStatus {
  if (actualMinutes <= 0) return "not_started";
  if (targetMinutes > 0 && actualMinutes >= targetMinutes) return "completed";
  return "studying";
}

export function deriveExecutionState(input: {
  plannedDate: string;
  today: string;
  status: PlanItemStatus;
  sessions: Pick<StudySession, "session_date" | "duration_minutes">[];
  targetMinutes: number;
}): ExecutionState {
  const actualMinutes = actualMinutesFromSessions(input.sessions);
  const complete =
    isCompletedStatus(input.status) ||
    (input.targetMinutes > 0 && actualMinutes >= input.targetMinutes);

  if (input.status === "cancelled") return "cancelled";
  if (input.status === "recovery") return "recovery";
  if (input.status === "needs_review") return "needs_review";
  if (input.status === "paused") return "paused";

  if (complete) {
    // With no logged session the completion happened on the day it was ticked
    // off, so finishing yesterday's item today reads as "เรียนย้อนหลังแล้ว".
    const actualDate = earliestActualDate(input.sessions) ?? input.today;
    if (actualDate < input.plannedDate) return "completed_early";
    if (actualDate > input.plannedDate) return "completed_late";
    return "completed_on_time";
  }

  if (actualMinutes > 0 || input.status === "studying") return "in_progress";
  if (input.plannedDate < input.today) return "overdue";
  return "not_started";
}

