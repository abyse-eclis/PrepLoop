import type { StudySessionVM } from "./types";

export interface StudyQueueGroups<T extends StudySessionVM = StudySessionVM> {
  /** Still to learn today, in learning order. */
  active: T[];
  /** "ถัดไป" — still owed, sorted after everything active. */
  deferred: T[];
  /** Finished or skipped. */
  done: T[];
}

function byOrder<T extends StudySessionVM>(a: T, b: T): number {
  return a.order - b.order || a.key.localeCompare(b.key);
}

function byDeferredAt<T extends StudySessionVM>(a: T, b: T): number {
  const at = a.deferredAt ?? "";
  const bt = b.deferredAt ?? "";
  return at.localeCompare(bt) || byOrder(a, b);
}

/**
 * Order today's learning queue.
 *
 * Deferred sessions always sink below every active one — pressing "ถัดไป"
 * moves a card to the end of the queue immediately — while staying in today's
 * plan. Among deferred sessions the one deferred first comes first, so
 * repeatedly deferring cycles through them fairly.
 */
export function groupStudyQueue<T extends StudySessionVM>(
  sessions: readonly T[]
): StudyQueueGroups<T> {
  const active: T[] = [];
  const deferred: T[] = [];
  const done: T[] = [];
  for (const s of sessions) {
    if (s.status === "deferred") deferred.push(s);
    else if (s.status === "completed" || s.status === "skipped") done.push(s);
    else active.push(s);
  }
  active.sort(byOrder);
  deferred.sort(byDeferredAt);
  done.sort(byOrder);
  return { active, deferred, done };
}

/** Flat learning queue: active first, then deferred. */
export function orderStudyQueue<T extends StudySessionVM>(sessions: readonly T[]): T[] {
  const groups = groupStudyQueue(sessions);
  return [...groups.active, ...groups.deferred, ...groups.done];
}

export interface QueueSummary {
  totalSessions: number;
  completedSessions: number;
  remainingSessions: number;
  deferredSessions: number;
  plannedMinutes: number;
  actualMinutes: number;
}

/** Counts for the header. Skipped sessions are neither owed nor counted. */
export function summarizeStudyQueue(sessions: readonly StudySessionVM[]): QueueSummary {
  const counted = sessions.filter((s) => s.status !== "skipped");
  const completed = counted.filter((s) => s.status === "completed");
  return {
    totalSessions: counted.length,
    completedSessions: completed.length,
    remainingSessions: counted.length - completed.length,
    deferredSessions: counted.filter((s) => s.status === "deferred").length,
    plannedMinutes: counted.reduce((sum, s) => sum + s.plannedMinutes, 0),
    actualMinutes: counted.reduce((sum, s) => sum + s.actualMinutes, 0),
  };
}
