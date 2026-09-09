import { progressPercent, statusAfterAddingTime } from "./status";
import type {
  SessionHistoryEntry,
  SessionPatch,
  SessionStatusAction,
  StudySessionVM,
} from "./types";

/**
 * Pure state transitions used for optimistic UI. The server applies the same
 * rules, so a successful request normally reconciles to an identical state;
 * a failed request restores the snapshot taken before the transition.
 */

export function applySessionPatch<T extends StudySessionVM>(
  sessions: readonly T[],
  key: string,
  patch: SessionPatch
): T[] {
  return sessions.map((s) => (s.key === key ? { ...s, ...patch } : s));
}

export function replaceSession<T extends StudySessionVM>(
  sessions: readonly T[],
  key: string,
  next: T
): T[] {
  return sessions.map((s) => (s.key === key ? next : s));
}

export function removeSession<T extends StudySessionVM>(
  sessions: readonly T[],
  key: string
): T[] {
  return sessions.filter((s) => s.key !== key);
}

/** Optimistic "เพิ่มเวลา": append history, bump minutes, derive status. */
export function optimisticAddTime(
  session: StudySessionVM,
  entries: SessionHistoryEntry[]
): SessionPatch {
  const added = entries.reduce((sum, e) => sum + Math.max(0, e.durationMinutes), 0);
  const actualMinutes = session.actualMinutes + added;
  const status = statusAfterAddingTime(session.status, actualMinutes, session.plannedMinutes);
  return {
    actualMinutes,
    progressPercent: progressPercent(actualMinutes, session.plannedMinutes),
    history: [...session.history, ...entries],
    status,
    rawStatus: status === "completed" ? "completed" : "studying",
    completedAt:
      status === "completed" ? (session.completedAt ?? entries[0]?.sessionDate ?? null) : session.completedAt,
    deferredAt: null,
  };
}

/** Optimistic status change for เรียนเสร็จ / ถัดไป / ข้าม / undo. */
export function optimisticStatus(
  session: StudySessionVM,
  action: SessionStatusAction,
  nowIso: string
): SessionPatch {
  switch (action) {
    case "completed":
      return {
        status: "completed",
        rawStatus: "completed",
        completedAt: nowIso,
        deferredAt: null,
        progressPercent: session.plannedMinutes > 0 ? session.progressPercent : 100,
      };
    case "deferred":
      return { status: "deferred", rawStatus: "deferred", deferredAt: nowIso, completedAt: null };
    case "skipped":
      return { status: "skipped", rawStatus: "skipped", deferredAt: null, completedAt: null };
    case "pending": {
      const status = session.actualMinutes > 0 ? "in_progress" : "pending";
      return {
        status,
        rawStatus: status === "in_progress" ? "studying" : "not_started",
        deferredAt: null,
        completedAt: null,
        progressPercent: progressPercent(session.actualMinutes, session.plannedMinutes),
      };
    }
  }
}
