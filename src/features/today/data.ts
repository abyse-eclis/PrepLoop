import { createServerSupabase } from "@/lib/supabase/server";
import { timeCompletion } from "@/lib/calculations";
import {
  deriveExecutionState,
  type ExecutionState,
} from "@/lib/study-execution";
import {
  getActivePlanVersion,
  getPlanDayTarget,
  getPlanVersionSummaries,
  resolvePlanItems,
  PLAN_ITEM_COLUMNS,
  STUDY_SESSION_COLUMNS,
  type ResolvedPlanItem,
} from "@/features/plans/data";
import { REVIEW_TASK_COLUMNS } from "@/features/reviews/data";
import {
  checkTaskPrerequisites,
  type PrerequisiteCheckResult,
  type PrerequisiteContext,
} from "@/lib/execution-order";
import {
  classifyQueueState,
  isQueueActionable,
  isQueueCompleted,
  isQueueExcluded,
  type QueueState,
} from "@/lib/plans/queue";
import type {
  CustomStudyItem,
  ItemStatusOverride,
  PlanItem,
  PlanVersion,
  ReviewTask,
  StudySession,
} from "@/types/db";
import type { CustomStudyWithSessions } from "@/features/custom-study/custom-study-card";
import type { PlanItemStatus } from "@/lib/schemas/common";

const UPCOMING_LIMIT = 7;

export interface QueuePlanItem extends ResolvedPlanItem {
  executionState: ExecutionState;
  prerequisiteStatus?: PrerequisiteCheckResult;
}

export interface TodayStudyQueue {
  version: PlanVersion | null;
  /** The first unfinished, actionable plan item in sequential order. */
  current: QueuePlanItem | null;
  /** Next actionable items in sequence to study ahead. */
  upcoming: QueuePlanItem[];
  /** Self-directed study items created for today. */
  customStudy: CustomStudyWithSessions[];
  /** Due review tasks. */
  supplementary: ReviewTask[];
  queueState: QueueState;
  queueError?: string;
  summary: {
    plannedTargetMinutes: number;
    actualMinutesToday: number;
    completedItems: number;
    totalItems: number;
    planProgressPercent: number;
    sessionCountToday: number;
  };
}

export async function getStudyQueue(
  workspaceId: string,
  date: string,
  upcomingLimit = UPCOMING_LIMIT
): Promise<TodayStudyQueue> {
  const supabase = await createServerSupabase();

  const [
    versions,
    sessionsTodayRes,
    reviewsRes,
    assessmentSourcesRes,
    courseLessonsRes,
    completedItemsRes,
    customStudyItemsRes,
  ] = await Promise.all([
    getPlanVersionSummaries(workspaceId),
    supabase
      .from("study_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("session_date", date)
      .order("start_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("review_tasks")
      .select(REVIEW_TASK_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .lte("due_date", date)
      .order("due_date", { ascending: true })
      .limit(12),
    supabase
      .from("assessment_sources")
      .select("id, external_id, required_completed_lessons")
      .eq("workspace_id", workspaceId),
    supabase
      .from("course_lessons")
      .select(
        "id, lesson_number, external_id, prerequisite_lesson_ids, courses!inner(code)"
      )
      .eq("workspace_id", workspaceId),
    supabase
      .from("study_plan_items")
      .select("course_code, lesson_to, item_status_overrides!inner(status)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("custom_study_items")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("study_date", date)
      .order("created_at", { ascending: true }),
  ]);

  const activeVersion =
    versions.find((v) => v.status === "active") ??
    versions[0] ??
    null;

  const allSessionsToday = (sessionsTodayRes.data as StudySession[] | null) ?? [];
  const actualMinutesToday = allSessionsToday.reduce(
    (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
    0
  );

  // Match Custom Study items with their sessions
  const customItems = (customStudyItemsRes.data as CustomStudyItem[] | null) ?? [];
  const customStudyWithSessions: CustomStudyWithSessions[] = customItems.map((ci) => {
    const matched = allSessionsToday.filter(
      (s) => s.custom_study_item_id === ci.id
    );
    const actualMin = matched.reduce(
      (sum, s) => sum + (s.duration_minutes ?? 0),
      0
    );
    return {
      item: ci,
      sessions: matched,
      actualMinutes: actualMin,
    };
  });

  const reviews = (reviewsRes.data as ReviewTask[] | null) ?? [];

  if (!activeVersion) {
    return {
      version: null,
      current: null,
      upcoming: [],
      customStudy: customStudyWithSessions,
      supplementary: reviews,
      queueState: "empty",
      summary: {
        plannedTargetMinutes: 0,
        actualMinutesToday,
        completedItems: 0,
        totalItems: 0,
        planProgressPercent: 0,
        sessionCountToday: allSessionsToday.length,
      },
    };
  }

  // Load day target for today
  const dayTarget = await getPlanDayTarget(workspaceId, activeVersion.id, date);
  const plannedTargetMinutes = dayTarget?.target_minutes ?? 0;

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

  // Fetch all plan items for the active version
  const { data: itemRows, error: itemError } = await supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("plan_version_id", activeVersion.id)
    .order("order_index", { ascending: true });

  if (itemError) {
    return {
      version: activeVersion,
      current: null,
      upcoming: [],
      customStudy: customStudyWithSessions,
      supplementary: reviews,
      queueState: "inconsistent",
      queueError: itemError.message,
      summary: {
        plannedTargetMinutes,
        actualMinutesToday,
        completedItems: 0,
        totalItems: 0,
        planProgressPercent: 0,
        sessionCountToday: allSessionsToday.length,
      },
    };
  }

  const allItems = ((itemRows as unknown) as PlanItem[] | null) ?? [];
  const resolvedItems = await resolvePlanItems(workspaceId, allItems);

  // Calculate completion stats across the active plan
  const totalItems = resolvedItems.length;
  let completedItems = 0;
  let excludedItems = 0;
  const candidateItems: ResolvedPlanItem[] = [];

  for (const row of resolvedItems) {
    if (isQueueCompleted(row.status)) {
      completedItems++;
    } else if (isQueueExcluded(row.status)) {
      excludedItems++;
    } else {
      candidateItems.push(row);
    }
  }

  const queueState = classifyQueueState({
    totalItems,
    completedItems,
    excludedItems,
    candidateItems: candidateItems.length,
  });

  const planProgressPercent =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Build QueuePlanItems with executionState and prerequisites
  function toQueueItem(row: ResolvedPlanItem): QueuePlanItem {
    return {
      ...row,
      executionState: deriveExecutionState({
        plannedDate: row.item.date,
        today: date,
        status: row.status,
        sessions: row.sessions,
        targetMinutes: row.item.target_minutes,
      }),
      prerequisiteStatus: checkTaskPrerequisites(
        {
          course_code: row.item.course_code,
          lesson_from: row.item.lesson_from,
          lesson_to: row.item.lesson_to,
          assessment_source_id: row.item.assessment_source_id,
          activity_type: row.item.activity_type,
        },
        prereqContext
      ),
    };
  }

  const currentItem = candidateItems[0] ? toQueueItem(candidateItems[0]) : null;
  const upcomingItems = candidateItems
    .slice(1, upcomingLimit + 1)
    .map(toQueueItem);

  return {
    version: activeVersion,
    current: currentItem,
    upcoming: upcomingItems,
    customStudy: customStudyWithSessions,
    supplementary: reviews,
    queueState,
    summary: {
      plannedTargetMinutes,
      actualMinutesToday,
      completedItems,
      totalItems,
      planProgressPercent,
      sessionCountToday: allSessionsToday.length,
    },
  };
}
