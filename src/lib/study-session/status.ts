import type { PlanItemStatus } from "@/lib/schemas/common";
import type { CustomStudyStatus } from "@/types/db";
import type { SessionStatus, SessionStatusAction } from "./types";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pending: "ยังไม่เริ่ม",
  in_progress: "กำลังเรียน",
  completed: "เรียนเสร็จ",
  deferred: "ถัดไป",
  skipped: "ข้าม",
};

export const SESSION_STATUS_CLASS: Record<SessionStatus, string> = {
  pending: "status-not_started",
  in_progress: "status-studying",
  completed: "status-completed",
  deferred: "status-deferred",
  skipped: "status-skipped",
};

/** Persisted statuses (either table) that mean "finished". */
const COMPLETED = new Set(["completed", "complete", "done", "finished"]);
/** Persisted statuses that mean "will not be studied". */
const SKIPPED = new Set(["skipped", "skip", "cancelled", "canceled"]);
const DEFERRED = new Set(["deferred"]);
const NOT_STARTED = new Set(["not_started", "planned", "pending", ""]);

/**
 * Map a persisted status from either source onto the unified semantic status.
 * Legacy values that predate the current enums are accepted (never crash on
 * imported data).
 */
export function toSessionStatus(
  rawStatus: string | null | undefined,
  actualMinutes = 0
): SessionStatus {
  const s = (rawStatus ?? "").trim().toLowerCase();
  if (COMPLETED.has(s)) return "completed";
  if (SKIPPED.has(s)) return "skipped";
  if (DEFERRED.has(s)) return "deferred";
  if (NOT_STARTED.has(s)) return actualMinutes > 0 ? "in_progress" : "pending";
  // studying, paused, incomplete, needs_review, recovery, unknown…
  return "in_progress";
}

/** Persisted plan-item status for a learner action. */
export function planStatusForAction(action: SessionStatusAction): PlanItemStatus {
  switch (action) {
    case "completed":
      return "completed";
    case "deferred":
      return "deferred";
    case "skipped":
      return "skipped";
    case "pending":
      return "not_started";
  }
}

/** Persisted custom-item status for a learner action. */
export function customStatusForAction(action: SessionStatusAction): CustomStudyStatus {
  switch (action) {
    case "completed":
      return "completed";
    case "deferred":
      return "deferred";
    case "skipped":
      return "skipped";
    case "pending":
      return "not_started";
  }
}

/**
 * Status after logging more time. Identical rule for both sources:
 * - a finished session stays finished;
 * - reaching the planned minutes finishes it;
 * - otherwise it is in progress (a deferred or skipped session the learner
 *   just studied is clearly back in play).
 */
export function statusAfterAddingTime(
  current: SessionStatus,
  actualMinutes: number,
  plannedMinutes: number
): SessionStatus {
  if (current === "completed") return "completed";
  if (plannedMinutes > 0 && actualMinutes >= plannedMinutes) return "completed";
  return "in_progress";
}

/** Persisted status matching `statusAfterAddingTime` for a plan item. */
export function planStatusAfterAddingTime(
  current: SessionStatus,
  actualMinutes: number,
  plannedMinutes: number
): PlanItemStatus {
  const next = statusAfterAddingTime(current, actualMinutes, plannedMinutes);
  return next === "completed" ? "completed" : "studying";
}

/** Persisted status matching `statusAfterAddingTime` for a custom item. */
export function customStatusAfterAddingTime(
  current: SessionStatus,
  actualMinutes: number,
  plannedMinutes: number
): CustomStudyStatus {
  const next = statusAfterAddingTime(current, actualMinutes, plannedMinutes);
  return next === "completed" ? "completed" : "studying";
}

export function progressPercent(actualMinutes: number, plannedMinutes: number): number {
  const actual = Math.max(0, actualMinutes);
  const planned = Math.max(0, plannedMinutes);
  if (planned === 0) return actual > 0 ? 100 : 0;
  return Math.min(100, Math.round((actual / planned) * 100));
}
