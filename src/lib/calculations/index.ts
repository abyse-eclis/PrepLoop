/**
 * Success / completion calculations.
 * These are pure functions computed from source data (no cached duplicates).
 */

export type Priority = "high" | "medium" | "low";

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export interface TimeCompletion {
  /** Capped at 100 for display. */
  percent: number;
  /** Raw uncapped percent. */
  rawPercent: number;
  /** Minutes over target (0 if not exceeded). */
  overMinutes: number;
  actualMinutes: number;
  targetMinutes: number;
}

export function timeCompletion(
  actualMinutes: number,
  targetMinutes: number
): TimeCompletion {
  const safeActual = Math.max(0, actualMinutes);
  const safeTarget = Math.max(0, targetMinutes);
  if (safeTarget === 0) {
    return {
      percent: safeActual > 0 ? 100 : 0,
      rawPercent: safeActual > 0 ? 100 : 0,
      overMinutes: safeActual,
      actualMinutes: safeActual,
      targetMinutes: 0,
    };
  }
  const raw = (safeActual / safeTarget) * 100;
  return {
    percent: Math.min(100, Math.round(raw)),
    rawPercent: Math.round(raw),
    overMinutes: Math.max(0, safeActual - safeTarget),
    actualMinutes: safeActual,
    targetMinutes: safeTarget,
  };
}

export function taskCompletion(
  completedCount: number,
  totalCount: number
): number {
  if (totalCount <= 0) return 0;
  return Math.round((completedCount / totalCount) * 100);
}

export interface WeightedItem {
  priority: Priority;
  completed: boolean;
}

export function weightedCompletion(items: WeightedItem[]): number {
  if (items.length === 0) return 0;
  let totalWeight = 0;
  let completedWeight = 0;
  for (const item of items) {
    const w = PRIORITY_WEIGHT[item.priority];
    totalWeight += w;
    if (item.completed) completedWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round((completedWeight / totalWeight) * 100);
}

export interface AssessmentInput {
  score: number;
  maxScore: number;
  totalQuestions?: number;
  correct?: number;
  incorrect?: number;
  skipped?: number;
  guessed?: number;
  durationMinutes?: number;
  passingPercentage: number;
}

export interface AssessmentResult {
  percentage: number;
  passed: boolean;
  /** percentage - passingPercentage (can be negative). */
  differenceFromPassing: number;
  /** correct / answered (excludes skipped) as percent, if available. */
  accuracy: number | null;
  /** minutes per question, if available. */
  averageTimePerQuestion: number | null;
}

export function assessmentResult(input: AssessmentInput): AssessmentResult {
  const max = input.maxScore > 0 ? input.maxScore : 0;
  const percentage = max > 0 ? Math.round((input.score / max) * 1000) / 10 : 0;
  const passed = percentage >= input.passingPercentage;

  let accuracy: number | null = null;
  if (
    typeof input.correct === "number" &&
    typeof input.totalQuestions === "number" &&
    input.totalQuestions > 0
  ) {
    const skipped = input.skipped ?? 0;
    const answered = input.totalQuestions - skipped;
    accuracy =
      answered > 0 ? Math.round((input.correct / answered) * 1000) / 10 : 0;
  }

  let averageTimePerQuestion: number | null = null;
  if (
    typeof input.durationMinutes === "number" &&
    typeof input.totalQuestions === "number" &&
    input.totalQuestions > 0
  ) {
    averageTimePerQuestion =
      Math.round((input.durationMinutes / input.totalQuestions) * 100) / 100;
  }

  return {
    percentage,
    passed,
    differenceFromPassing: Math.round((percentage - input.passingPercentage) * 10) / 10,
    accuracy,
    averageTimePerQuestion,
  };
}

/**
 * Validate that answer counts are internally consistent.
 * correct + incorrect + skipped must not exceed totalQuestions.
 */
export function validateAnswerCounts(input: {
  totalQuestions: number;
  correct: number;
  incorrect: number;
  skipped: number;
}): { ok: boolean; error?: string } {
  const sum = input.correct + input.incorrect + input.skipped;
  if (sum > input.totalQuestions) {
    return {
      ok: false,
      error: `ผลรวมของ ถูก+ผิด+ข้าม (${sum}) เกินจำนวนข้อทั้งหมด (${input.totalQuestions})`,
    };
  }
  return { ok: true };
}

export type ScoreTrend = "up" | "down" | "same" | "none";

export function scoreTrend(
  current: number,
  previous: number | null | undefined
): ScoreTrend {
  if (previous === null || previous === undefined) return "none";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "same";
}

/**
 * Aggregate a day/period summary from source items and sessions.
 */
export interface DaySummaryInput {
  items: Array<{
    priority: Priority;
    targetMinutes: number;
    status: string;
  }>;
  actualMinutesByItem: number[];
  completedStatuses?: string[];
  /**
   * Statuses dropped from the day entirely — no target minutes, and out of the
   * completion denominator. Work the user skipped or a newer plan cancelled is
   * not owed, so it must not read as failure.
   */
  excludedStatuses?: string[];
}

export interface DaySummary {
  targetMinutes: number;
  actualMinutes: number;
  time: TimeCompletion;
  taskCompletionPercent: number;
  weightedCompletionPercent: number;
  totalItems: number;
  completedItems: number;
  pendingItems: number;
  /** Items left out of the day (skipped or cancelled). */
  excludedItems: number;
}

const DEFAULT_COMPLETED = ["completed"];
const DEFAULT_EXCLUDED = ["skipped", "cancelled"];

export function daySummary(input: DaySummaryInput): DaySummary {
  const completedSet = new Set(input.completedStatuses ?? DEFAULT_COMPLETED);
  const excludedSet = new Set(input.excludedStatuses ?? DEFAULT_EXCLUDED);
  const counted = input.items.filter((i) => !excludedSet.has(i.status));

  const targetMinutes = counted.reduce((s, i) => s + i.targetMinutes, 0);
  const actualMinutes = input.actualMinutesByItem.reduce((s, m) => s + m, 0);
  const completedItems = counted.filter((i) => completedSet.has(i.status)).length;
  const totalItems = counted.length;

  return {
    targetMinutes,
    actualMinutes,
    time: timeCompletion(actualMinutes, targetMinutes),
    taskCompletionPercent: taskCompletion(completedItems, totalItems),
    weightedCompletionPercent: weightedCompletion(
      counted.map((i) => ({
        priority: i.priority,
        completed: completedSet.has(i.status),
      }))
    ),
    totalItems,
    completedItems,
    pendingItems: totalItems - completedItems,
    excludedItems: input.items.length - counted.length,
  };
}
