import { createServerSupabase } from "@/lib/supabase/server";
import {
  getPlanExecutionData,
  getHistoricalPlanItemRefs,
  getPlanVersionSummaries,
  PLAN_ITEM_COLUMNS,
  type ResolvedPlanItem,
} from "@/features/plans/data";
import { REVIEW_TASK_COLUMNS } from "@/features/reviews/data";
import {
  buildPlanItemOverrideMap,
  resolvePlanItemsProgress,
} from "@/lib/plans/progress";
import {
  checkTaskPrerequisites,
  type PrerequisiteContext,
} from "@/lib/execution-order";
import {
  classifyQueueState,
  isQueueCompleted,
  isQueueExcluded,
  type QueueState,
} from "@/lib/plans/queue";
import {
  buildCustomSessionVM,
  buildLessonLookup,
  buildPlanSessionVM,
  type LessonLookupEntry,
  type StudySessionVM,
} from "@/lib/study-session";
import { dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/dates";
import type {
  CustomStudyItem,
  ItemStatusOverride,
  PlanItem,
  PlanVersion,
  ReviewTask,
} from "@/types/db";

/** How many not-yet-deferred plan items today's queue shows ahead. */
const QUEUE_WINDOW = 8;

export interface TodayStudyQueue {
  version: PlanVersion | null;
  /**
   * Today's unified learning queue: the next plan items in sequence, every
   * deferred plan item, plan items finished/skipped today, and every
   * self-added session for today. Already in learning order.
   */
  sessions: StudySessionVM[];
  /** Raw self-added items for today (needed by the edit dialog). */
  customItems: CustomStudyItem[];
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

/**
 * Load everything the Today page needs in two parallel round-trips:
 *
 *   stage 1 — everything that only depends on the workspace
 *             (versions, reviews, prerequisites, custom items, all overrides,
 *              all sessions)
 *   stage 2 — everything that depends on the active version or on stage 1
 *             (day target, the version's items, historical item refs)
 *
 * Previously this was seven sequential stages (≈9 round-trips with auth).
 */
export async function getStudyQueue(
  workspaceId: string,
  date: string,
  timezone: string = DEFAULT_TIMEZONE
): Promise<TodayStudyQueue> {
  const supabase = await createServerSupabase();

  // ---- stage 1 -------------------------------------------------------------
  const [
    versions,
    execution,
    reviewsRes,
    assessmentSourcesRes,
    courseLessonsRes,
    completedItemsRes,
    customStudyItemsRes,
  ] = await Promise.all([
    getPlanVersionSummaries(workspaceId),
    getPlanExecutionData(workspaceId),
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
        "id, lesson_number, external_id, title, lesson_url, source_type, prerequisite_lesson_ids, courses!inner(code)"
      )
      .eq("workspace_id", workspaceId),
    supabase
      .from("study_plan_items")
      .select("course_code, lesson_to, item_status_overrides!inner(status)")
      .eq("workspace_id", workspaceId)
      .eq("item_status_overrides.status", "completed"),
    supabase
      .from("custom_study_items")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("study_date", date)
      .order("created_at", { ascending: true }),
  ]);

  const activeVersion =
    versions.find((v) => v.status === "active") ?? versions[0] ?? null;

  const allSessions = execution.sessions;
  const sessionsToday = allSessions.filter((s) => s.session_date === date);
  const actualMinutesToday = sessionsToday.reduce(
    (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
    0
  );

  const reviews = (reviewsRes.data as ReviewTask[] | null) ?? [];
  const customItems = (customStudyItemsRes.data as CustomStudyItem[] | null) ?? [];

  const customSessions: StudySessionVM[] = customItems.map((item, index) =>
    buildCustomSessionVM({
      item,
      sessions: allSessions.filter((s) => s.custom_study_item_id === item.id),
      // Self-added sessions follow the plan window in the base order.
      order: 10_000 + index,
    })
  );

  const baseSummary = {
    plannedTargetMinutes: 0,
    actualMinutesToday,
    completedItems: 0,
    totalItems: 0,
    planProgressPercent: 0,
    sessionCountToday: sessionsToday.length,
  };

  if (!activeVersion) {
    return {
      version: null,
      sessions: customSessions,
      customItems,
      supplementary: reviews,
      queueState: "empty",
      summary: baseSummary,
    };
  }

  // ---- stage 2 -------------------------------------------------------------
  const [dayTargetRes, itemsRes, historicalRows] = await Promise.all([
    supabase
      .from("study_plan_days")
      .select("target_minutes, nap_target_minutes")
      .eq("workspace_id", workspaceId)
      .eq("plan_version_id", activeVersion.id)
      .eq("date", date)
      .maybeSingle(),
    supabase
      .from("study_plan_items")
      .select(PLAN_ITEM_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("plan_version_id", activeVersion.id)
      .order("order_index", { ascending: true }),
    getHistoricalPlanItemRefs(workspaceId, execution),
  ]);

  const plannedTargetMinutes =
    (dayTargetRes.data as { target_minutes: number } | null)?.target_minutes ?? 0;

  if (itemsRes.error) {
    return {
      version: activeVersion,
      sessions: customSessions,
      customItems,
      supplementary: reviews,
      queueState: "inconsistent",
      queueError: itemsRes.error.message,
      summary: { ...baseSummary, plannedTargetMinutes },
    };
  }

  const allItems = (itemsRes.data as unknown as PlanItem[] | null) ?? [];
  const resolvedItems = resolvePlanItemsProgress(
    allItems,
    allSessions,
    execution.overrides,
    historicalRows
  );
  const overrideByItemId = buildPlanItemOverrideMap(
    allItems,
    execution.overrides,
    historicalRows
  );

  // ---- prerequisite context ----------------------------------------------
  const prereqContext = buildPrerequisiteContext({
    completedItems: completedItemsRes.data,
    assessmentSources: assessmentSourcesRes.data,
    courseLessons: courseLessonsRes.data,
  });
  const lessons = buildLessonLookup(
    lessonEntries(courseLessonsRes.data)
  );

  // ---- plan progress & queue window -----------------------------------------
  const totalItems = resolvedItems.length;
  let completedItems = 0;
  let excludedItems = 0;
  const candidates: ResolvedPlanItem[] = [];
  const doneToday: ResolvedPlanItem[] = [];

  for (const row of resolvedItems) {
    const override = overrideByItemId.get(row.item.id);
    if (isQueueCompleted(row.status)) {
      completedItems++;
      if (wasTouchedToday(row, override, date, timezone)) doneToday.push(row);
    } else if (isQueueExcluded(row.status)) {
      excludedItems++;
      if (wasTouchedToday(row, override, date, timezone)) doneToday.push(row);
    } else {
      candidates.push(row);
    }
  }

  const queueState = classifyQueueState({
    totalItems,
    completedItems,
    excludedItems,
    candidateItems: candidates.length,
  });

  // The window shows the next N non-deferred items plus EVERY deferred item,
  // so pressing "ถัดไป" never makes a card disappear from today's plan.
  const nonDeferred = candidates.filter((row) => row.status !== "deferred");
  const deferred = candidates.filter((row) => row.status === "deferred");
  const windowRows = [...nonDeferred.slice(0, QUEUE_WINDOW), ...deferred, ...doneToday];

  const planSessions: StudySessionVM[] = windowRows.map((row) => {
    const override = overrideByItemId.get(row.item.id);
    const prerequisite = checkTaskPrerequisites(
      {
        course_code: row.item.course_code,
        lesson_from: row.item.lesson_from,
        lesson_to: row.item.lesson_to,
        assessment_source_id: row.item.assessment_source_id,
        activity_type: row.item.activity_type,
      },
      prereqContext
    );
    return buildPlanSessionVM({
      row,
      order: row.item.order_index,
      lessons,
      blockedReason: prerequisite.isBlocked ? (prerequisite.reason ?? null) : null,
      notes: override?.notes ?? null,
      completedAt: override?.completed_at ?? null,
      deferredAt: override?.deferred_at ?? override?.updated_at ?? null,
    });
  });

  return {
    version: activeVersion,
    sessions: [...planSessions, ...customSessions],
    customItems,
    supplementary: reviews,
    queueState,
    summary: {
      plannedTargetMinutes,
      actualMinutesToday,
      completedItems,
      totalItems,
      planProgressPercent:
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      sessionCountToday: sessionsToday.length,
    },
  };
}

/** A finished/skipped plan item still belongs to today's list if it happened today. */
function wasTouchedToday(
  row: ResolvedPlanItem,
  override: ItemStatusOverride | undefined,
  date: string,
  timezone: string
): boolean {
  if (row.sessions.some((s) => s.session_date === date)) return true;
  const stamp = override?.completed_at ?? override?.updated_at ?? null;
  if (!stamp) return false;
  try {
    return dateKeyInTimezone(new Date(stamp), timezone) === date;
  } catch {
    return false;
  }
}

type CourseLessonRow = {
  id: string;
  lesson_number: string;
  external_id: string;
  title: string | null;
  lesson_url: string | null;
  source_type: string | null;
  prerequisite_lesson_ids: string[] | null;
  courses: { code: string } | { code: string }[] | null;
};

function courseCodeOf(row: CourseLessonRow): string | null {
  const c = Array.isArray(row.courses) ? row.courses[0] : row.courses;
  return c?.code ?? null;
}

function lessonEntries(data: unknown): LessonLookupEntry[] {
  const rows = (data as CourseLessonRow[] | null) ?? [];
  const entries: LessonLookupEntry[] = [];
  for (const row of rows) {
    const courseCode = courseCodeOf(row);
    if (!courseCode) continue;
    entries.push({
      courseCode,
      lessonNumber: row.lesson_number,
      title: row.title?.trim() ? row.title.trim() : `คลิป ${row.lesson_number}`,
      lessonUrl: row.lesson_url ?? null,
      sourceType: row.source_type ?? null,
    });
  }
  return entries;
}

function buildPrerequisiteContext(input: {
  completedItems: unknown;
  assessmentSources: unknown;
  courseLessons: unknown;
}): PrerequisiteContext {
  const completedLessonsByCourse = new Map<string, Set<string>>();
  for (const it of (input.completedItems as Array<{
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
  for (const a of (input.assessmentSources as Array<{
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
  for (const l of (input.courseLessons as CourseLessonRow[] | null) ?? []) {
    if (l.prerequisite_lesson_ids && l.prerequisite_lesson_ids.length > 0) {
      lessonPrerequisites.set(l.lesson_number, l.prerequisite_lesson_ids);
      lessonPrerequisites.set(l.external_id, l.prerequisite_lesson_ids);
    }
  }

  return { completedLessonsByCourse, assessmentRequiredLessons, lessonPrerequisites };
}
