import { createServerSupabase } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import { timeCompletion } from "@/lib/calculations";
import {
  deriveExecutionState,
  type ExecutionState,
} from "@/lib/study-execution";
import {
  buildCarryOver,
  CARRY_OVER_LOOKBACK_DAYS,
  type CarryOverSummary,
} from "@/lib/carryover";
import { selectVersionForDate, versionIdsByDate } from "@/lib/plans/version";
import {
  getPlanDayTarget,
  getPlanItemsForVersion,
  getPlanItemsInRange,
  getPlanVersionSummaries,
  resolvePlanItems,
  type ResolvedPlanItem,
} from "@/features/plans/data";
import { REVIEW_TASK_COLUMNS } from "@/features/reviews/data";
import {
  applyExecutionOrder,
  checkTaskPrerequisites,
  normalizeOrderedIds,
  type PrerequisiteCheckResult,
  type PrerequisiteContext,
} from "@/lib/execution-order";
import type { PlanVersion, ReviewTask, StudySession } from "@/types/db";

/** Max carried-over items surfaced on Today (newest planned dates win). */
const CARRY_OVER_LIMIT = 60;
/** Raw rows fetched before filtering to the version that owns each date. */
const CARRY_OVER_FETCH_LIMIT = CARRY_OVER_LIMIT * 4;
const NEXT_LIMIT = 8;

export interface QueuePlanItem extends ResolvedPlanItem {
  executionState: ExecutionState;
  prerequisiteStatus?: PrerequisiteCheckResult;
}

export interface TodayStudyQueue {
  version: PlanVersion | null;
  /** Unfinished work from earlier days, grouped by the day it came from. */
  carryOver: CarryOverSummary<QueuePlanItem>;
  /**
   * Past items the user skipped. They are out of the backlog, but stay on the
   * page so "ข้าม" can be undone without hunting through /history.
   */
  carryOverSkipped: QueuePlanItem[];
  today: QueuePlanItem[];
  supplementary: ReviewTask[];
  next: QueuePlanItem[];
  hasCustomOrder: boolean;
  summary: {
    plannedTargetMinutes: number;
    actualMinutesToday: number;
    remainingTargetMinutes: number;
    overTargetMinutes: number;
    todayCompletedItems: number;
    todayTotalItems: number;
    sessionCountToday: number;
    /** Target minutes still owed by carried-over items. */
    carryOverRemainingMinutes: number;
    /** Minutes logged today against carried-over items ("เรียนย้อนหลัง"). */
    carryOverMinutesToday: number;
    /** Today's own target plus the carry-over debt. */
    totalWorkloadMinutes: number;
    /** Past items dropped from the backlog because they were skipped. */
    carryOverSkippedItems: number;
  };
}

function withExecutionStateAndPrereqs(
  items: ResolvedPlanItem[],
  today: string,
  prereqContext?: PrerequisiteContext
): QueuePlanItem[] {
  return items.map((row) => ({
    ...row,
    executionState: deriveExecutionState({
      plannedDate: row.item.date,
      today,
      status: row.status,
      sessions: row.sessions,
      targetMinutes: row.item.target_minutes,
    }),
    prerequisiteStatus: prereqContext
      ? checkTaskPrerequisites(
          {
            course_code: row.item.course_code,
            lesson_from: row.item.lesson_from,
            lesson_to: row.item.lesson_to,
            assessment_source_id: row.item.assessment_source_id,
            activity_type: row.item.activity_type,
          },
          prereqContext
        )
      : { isBlocked: false },
  }));
}

function isComplete(row: QueuePlanItem): boolean {
  return row.executionState.startsWith("completed_");
}

function minutesOnDate(sessions: StudySession[], date: string): number {
  return sessions
    .filter((s) => s.session_date === date)
    .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
}

/**
 * Plan items from earlier days that may still be owed, across every plan
 * version. Items whose date is no longer owned by their version (superseded by
 * a recovery plan) are dropped — that day belongs to the newer plan now.
 */
async function loadPastPlanItems(
  workspaceId: string,
  versions: PlanVersion[],
  date: string
) {
  const items = await getPlanItemsInRange(workspaceId, {
    start: addDays(date, -CARRY_OVER_LOOKBACK_DAYS),
    end: addDays(date, -1),
    limit: CARRY_OVER_FETCH_LIMIT,
    ascending: false,
  });
  if (items.length === 0) return [];

  const ownerByDate = versionIdsByDate(
    versions,
    items.map((item) => item.date)
  );

  return items
    .filter((item) => ownerByDate.get(item.date) === item.plan_version_id)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.priority.localeCompare(b.priority)
    )
    .slice(0, CARRY_OVER_LIMIT);
}

export async function getStudyQueue(
  workspaceId: string,
  date: string
): Promise<TodayStudyQueue> {
  const supabase = await createServerSupabase();
  const versions = await getPlanVersionSummaries(workspaceId);
  const version = selectVersionForDate(versions, date);

  const [
    pastItems,
    todayItems,
    nextItems,
    dayTarget,
    reviews,
    sessionsToday,
    customOrderRes,
    assessmentSourcesRes,
    courseLessonsRes,
    completedItemsRes,
  ] = await Promise.all([
    loadPastPlanItems(workspaceId, versions, date),
    version
      ? getPlanItemsForVersion(workspaceId, version.id, {
          start: date,
          end: date,
        })
      : Promise.resolve([]),
    version
      ? getPlanItemsForVersion(workspaceId, version.id, {
          start: addDays(date, 1),
          limit: NEXT_LIMIT,
          ascending: true,
        })
      : Promise.resolve([]),
    version
      ? getPlanDayTarget(workspaceId, version.id, date)
      : Promise.resolve(null),
    supabase
      .from("review_tasks")
      .select(REVIEW_TASK_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .lte("due_date", date)
      .order("due_date", { ascending: true })
      .limit(12),
    supabase
      .from("study_sessions")
      .select("id, duration_minutes")
      .eq("workspace_id", workspaceId)
      .eq("session_date", date),
    supabase
      .from("daily_execution_orders")
      .select("ordered_item_ids")
      .eq("workspace_id", workspaceId)
      .eq("execution_date", date)
      .maybeSingle(),
    supabase
      .from("assessment_sources")
      .select("id, external_id, required_completed_lessons")
      .eq("workspace_id", workspaceId),
    supabase
      .from("course_lessons")
      .select("id, lesson_number, external_id, prerequisite_lesson_ids, courses!inner(code)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("study_plan_items")
      .select("course_code, lesson_to, item_status_overrides!inner(status)")
      .eq("workspace_id", workspaceId),
  ]);

  // Build prerequisite context
  const completedLessonsByCourse = new Map<string, Set<string>>();
  for (const it of (completedItemsRes.data as Array<{
    course_code: string | null;
    lesson_to: string | null;
    item_status_overrides: { status: string } | { status: string }[];
  }> | null) ?? []) {
    const ov = Array.isArray(it.item_status_overrides)
      ? it.item_status_overrides[0]
      : it.item_status_overrides;
    if (ov?.status !== "completed" || !it.course_code || !it.lesson_to) continue;
    const cur = completedLessonsByCourse.get(it.course_code) ?? new Set<string>();
    cur.add(it.lesson_to);
    completedLessonsByCourse.set(it.course_code, cur);
  }

  const assessmentRequiredLessons = new Map<string, string[]>();
  for (const a of (assessmentSourcesRes.data as Array<{
    id: string;
    external_id: string;
    required_completed_lessons: string[] | null;
  }> | null) ?? []) {
    if (a.required_completed_lessons && a.required_completed_lessons.length > 0) {
      assessmentRequiredLessons.set(a.id, a.required_completed_lessons);
      assessmentRequiredLessons.set(a.external_id, a.required_completed_lessons);
    }
  }

  const lessonPrerequisites = new Map<string, string[]>();
  for (const l of (courseLessonsRes.data as Array<{
    lesson_number: string;
    external_id: string;
    prerequisite_lesson_ids: string[] | null;
  }> | null) ?? []) {
    if (l.prerequisite_lesson_ids && l.prerequisite_lesson_ids.length > 0) {
      lessonPrerequisites.set(l.lesson_number, l.prerequisite_lesson_ids);
      lessonPrerequisites.set(l.external_id, l.prerequisite_lesson_ids);
    }
  }

  const prereqContext: PrerequisiteContext = {
    completedLessonsByCourse,
    assessmentRequiredLessons,
    lessonPrerequisites,
  };

  const resolvedItems = await resolvePlanItems(workspaceId, [
    ...todayItems,
    ...pastItems,
    ...nextItems,
  ]);
  const resolvedById = new Map(resolvedItems.map((row) => [row.item.id, row]));
  const pick = (ids: { id: string }[]) =>
    ids
      .map((item) => resolvedById.get(item.id))
      .filter((row): row is ResolvedPlanItem => Boolean(row));

  const rawTodayQueue = withExecutionStateAndPrereqs(pick(todayItems), date, prereqContext);
  const pastQueue = withExecutionStateAndPrereqs(pick(pastItems), date, prereqContext);
  const nextQueue = withExecutionStateAndPrereqs(pick(nextItems), date, prereqContext).filter(
    (row) => !isComplete(row)
  );

  // Apply custom execution order if saved
  const customOrderIds = normalizeOrderedIds(customOrderRes.data?.ordered_item_ids);
  const hasCustomOrder = customOrderIds.length > 0;
  const todayQueue = hasCustomOrder
    ? applyExecutionOrder(rawTodayQueue, customOrderIds)
    : rawTodayQueue;

  const carryOver = buildCarryOver(pastQueue, date, (row) => ({
    plannedDate: row.item.date,
    targetMinutes: row.item.target_minutes,
    actualMinutes: row.actualMinutes,
    executionState: row.executionState,
  }));
  const carryOverSkipped = pastQueue
    .filter((row) => row.executionState === "skipped")
    .sort((a, b) => b.item.date.localeCompare(a.item.date));
  const carryOverMinutesToday = carryOver.entries.reduce(
    (sum, entry) => sum + minutesOnDate(entry.row.sessions, date),
    0
  );

  const actualMinutesToday = (
    (sessionsToday.data as Array<{ duration_minutes: number }> | null) ?? []
  ).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const plannedTargetMinutes =
    dayTarget?.target_minutes ??
    todayItems.reduce((sum, item) => sum + item.target_minutes, 0);
  const time = timeCompletion(actualMinutesToday, plannedTargetMinutes);

  return {
    version,
    carryOver,
    carryOverSkipped,
    today: todayQueue,
    supplementary: (reviews.data as ReviewTask[] | null) ?? [],
    next: nextQueue,
    hasCustomOrder,
    summary: {
      plannedTargetMinutes,
      actualMinutesToday,
      remainingTargetMinutes: Math.max(
        0,
        plannedTargetMinutes - actualMinutesToday
      ),
      overTargetMinutes: time.overMinutes,
      todayCompletedItems: todayQueue.filter(isComplete).length,
      todayTotalItems: todayQueue.length,
      sessionCountToday:
        (sessionsToday.data as Array<{ id: string }> | null)?.length ?? 0,
      carryOverRemainingMinutes: carryOver.remainingMinutes,
      carryOverMinutesToday,
      totalWorkloadMinutes: plannedTargetMinutes + carryOver.remainingMinutes,
      carryOverSkippedItems: carryOverSkipped.length,
    },
  };
}
