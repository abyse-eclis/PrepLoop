import { createServerSupabase } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import { timeCompletion } from "@/lib/calculations";
import {
  deriveExecutionState,
  type ExecutionState,
} from "@/lib/study-execution";
import {
  getPlanDayTarget,
  getPlanItemsForVersion,
  resolvePlanItems,
  resolveVersionForDate,
  type ResolvedPlanItem,
} from "@/features/plans/data";
import { REVIEW_TASK_COLUMNS } from "@/features/reviews/data";
import type { PlanVersion, ReviewTask } from "@/types/db";

const OVERDUE_LIMIT = 60;
const NEXT_LIMIT = 8;

export interface QueuePlanItem extends ResolvedPlanItem {
  executionState: ExecutionState;
}

export interface TodayStudyQueue {
  version: PlanVersion | null;
  overdue: QueuePlanItem[];
  today: QueuePlanItem[];
  supplementary: ReviewTask[];
  next: QueuePlanItem[];
  summary: {
    plannedTargetMinutes: number;
    actualMinutesToday: number;
    remainingTargetMinutes: number;
    overTargetMinutes: number;
    todayCompletedItems: number;
    todayTotalItems: number;
    sessionCountToday: number;
  };
}

function withExecutionState(
  items: ResolvedPlanItem[],
  today: string
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
  }));
}

function isComplete(row: QueuePlanItem): boolean {
  return row.executionState.startsWith("completed_");
}

export async function getStudyQueue(
  workspaceId: string,
  date: string
): Promise<TodayStudyQueue> {
  const supabase = await createServerSupabase();
  const version = await resolveVersionForDate(workspaceId, date);

  if (!version) {
    const { data: sessionData } = await supabase
      .from("study_sessions")
      .select("duration_minutes")
      .eq("workspace_id", workspaceId)
      .eq("session_date", date);
    const actualMinutesToday = (
      (sessionData as Array<{ duration_minutes: number }> | null) ?? []
    ).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

    return {
      version: null,
      overdue: [],
      today: [],
      supplementary: [],
      next: [],
      summary: {
        plannedTargetMinutes: 0,
        actualMinutesToday,
        remainingTargetMinutes: 0,
        overTargetMinutes: actualMinutesToday,
        todayCompletedItems: 0,
        todayTotalItems: 0,
        sessionCountToday: sessionData?.length ?? 0,
      },
    };
  }

  const [todayItems, overdueItems, nextItems, dayTarget, reviews, sessionsToday] =
    await Promise.all([
      getPlanItemsForVersion(workspaceId, version.id, { start: date, end: date }),
      getPlanItemsForVersion(workspaceId, version.id, {
        end: addDays(date, -1),
        limit: OVERDUE_LIMIT,
        ascending: false,
      }),
      getPlanItemsForVersion(workspaceId, version.id, {
        start: addDays(date, 1),
        limit: NEXT_LIMIT,
        ascending: true,
      }),
      getPlanDayTarget(workspaceId, version.id, date),
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
    ]);

  const sortedOverdueItems = [...overdueItems].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const resolvedItems = await resolvePlanItems(workspaceId, [
    ...todayItems,
    ...sortedOverdueItems,
    ...nextItems,
  ]);
  const resolvedById = new Map(resolvedItems.map((row) => [row.item.id, row]));
  const resolvedToday = todayItems
    .map((item) => resolvedById.get(item.id))
    .filter((row): row is ResolvedPlanItem => Boolean(row));
  const resolvedOverdue = sortedOverdueItems
    .map((item) => resolvedById.get(item.id))
    .filter((row): row is ResolvedPlanItem => Boolean(row));
  const resolvedNext = nextItems
    .map((item) => resolvedById.get(item.id))
    .filter((row): row is ResolvedPlanItem => Boolean(row));

  const todayQueue = withExecutionState(resolvedToday, date);
  const overdueQueue = withExecutionState(resolvedOverdue, date).filter(
    (row) => !isComplete(row)
  );
  const nextQueue = withExecutionState(resolvedNext, date).filter(
    (row) => !isComplete(row)
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
    overdue: overdueQueue,
    today: todayQueue,
    supplementary: (reviews.data as ReviewTask[] | null) ?? [],
    next: nextQueue,
    summary: {
      plannedTargetMinutes,
      actualMinutesToday,
      remainingTargetMinutes: Math.max(0, plannedTargetMinutes - actualMinutesToday),
      overTargetMinutes: time.overMinutes,
      todayCompletedItems: todayQueue.filter(isComplete).length,
      todayTotalItems: todayQueue.length,
      sessionCountToday:
        (sessionsToday.data as Array<{ id: string }> | null)?.length ?? 0,
    },
  };
}
