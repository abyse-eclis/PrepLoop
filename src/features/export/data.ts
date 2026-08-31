import { createServerSupabase } from "@/lib/supabase/server";
import { dateRange, isoWeekKey, monthKey } from "@/lib/dates";
import { daySummary } from "@/lib/calculations";
import { versionIdsByDate } from "@/lib/plans/version";
import {
  getPlanItemsInRange,
  getPlanVersionSummaries,
  resolvePlanItems,
} from "@/features/plans/data";
import { deriveExecutionState } from "@/lib/study-execution";
import type { ResolvedExportRange } from "@/lib/export/range";
import type {
  ExportAssessmentRow,
  ExportDayRow,
  ExportPlanItemRow,
  ExportSessionRow,
  StudyExport,
} from "@/lib/export/types";
import type {
  AssessmentAttempt,
  PlanVersion,
  StudySession,
  Workspace,
} from "@/types/db";

export type * from "@/lib/export/types";

const SESSION_EXPORT_COLUMNS =
  "id, plan_item_id, subject, activity_type, course_code, session_date, start_time, end_time, duration_minutes, status, actual_lesson_from, actual_lesson_to, note";

const ATTEMPT_EXPORT_COLUMNS =
  "id, subject, attempt_date, score, max_score, total_questions, correct, incorrect, skipped, guessed, duration_minutes, passing_percentage, percentage, passed, notes";

/**
 * Earliest and latest dates the workspace holds any study data for — the
 * bounds of the "ทั้งหมด" export. Looks at sessions, attempts and plan items,
 * since a workspace can have a plan before its first session.
 */
export async function getDataBounds(
  workspaceId: string
): Promise<{ earliest: string | null; latest: string | null }> {
  const supabase = await createServerSupabase();
  const pick = async (
    table: string,
    column: string,
    ascending: boolean
  ): Promise<string | null> => {
    const { data } = await supabase
      .from(table)
      .select(column)
      .eq("workspace_id", workspaceId)
      .order(column, { ascending })
      .limit(1)
      .maybeSingle();
    return (data as Record<string, string> | null)?.[column] ?? null;
  };

  const results = await Promise.all([
    pick("study_sessions", "session_date", true),
    pick("study_sessions", "session_date", false),
    pick("assessment_attempts", "attempt_date", true),
    pick("assessment_attempts", "attempt_date", false),
    pick("study_plan_items", "date", true),
    pick("study_plan_items", "date", false),
  ]);

  const dates = results.filter((d): d is string => Boolean(d));
  if (dates.length === 0) return { earliest: null, latest: null };
  return {
    earliest: dates.reduce((a, b) => (a < b ? a : b)),
    latest: dates.reduce((a, b) => (a > b ? a : b)),
  };
}

/**
 * Assemble everything the export formats need in one pass.
 *
 * Plan items are filtered to the version that owns each date, so a range that
 * spans a recovery plan reports each day under the plan that was actually in
 * effect then instead of double-counting both versions.
 */
export async function buildStudyExport(
  workspace: Workspace,
  range: ResolvedExportRange
): Promise<StudyExport> {
  const supabase = await createServerSupabase();

  const [versions, planItems, sessionsResult, attemptsResult] =
    await Promise.all([
      getPlanVersionSummaries(workspace.id),
      getPlanItemsInRange(workspace.id, { start: range.start, end: range.end }),
      supabase
        .from("study_sessions")
        .select(SESSION_EXPORT_COLUMNS)
        .eq("workspace_id", workspace.id)
        .gte("session_date", range.start)
        .lte("session_date", range.end)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false }),
      supabase
        .from("assessment_attempts")
        .select(ATTEMPT_EXPORT_COLUMNS)
        .eq("workspace_id", workspace.id)
        .gte("attempt_date", range.start)
        .lte("attempt_date", range.end)
        .order("attempt_date", { ascending: true }),
    ]);

  const ownerByDate = versionIdsByDate(
    versions as PlanVersion[],
    planItems.map((item) => item.date)
  );
  const ownedItems = planItems.filter(
    (item) => ownerByDate.get(item.date) === item.plan_version_id
  );
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const resolved = await resolvePlanItems(workspace.id, ownedItems);

  const planItemRows: ExportPlanItemRow[] = resolved.map((row) => {
    const version = versionById.get(row.item.plan_version_id) ?? null;
    return {
      id: row.item.id,
      plannedDate: row.item.date,
      weekKey: isoWeekKey(row.item.date),
      monthKey: monthKey(row.item.date),
      planVersion: version?.name ?? null,
      planVersionNumber: version?.version_number ?? null,
      stableExternalId: row.item.stable_external_id,
      subject: row.item.subject,
      courseCode: row.item.course_code,
      activityType: row.item.activity_type,
      lessonFrom: row.item.lesson_from,
      lessonTo: row.item.lesson_to,
      priority: row.item.priority,
      targetMinutes: row.item.target_minutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      executionState: deriveExecutionState({
        plannedDate: row.item.date,
        today: range.end,
        status: row.status,
        sessions: row.sessions,
        targetMinutes: row.item.target_minutes,
      }),
      instructions: row.item.instructions,
    };
  });

  const plannedDateByItemId = new Map(
    resolved.map((row) => [row.item.id, row.item.date])
  );

  const sessionRows: ExportSessionRow[] = (
    (sessionsResult.data as StudySession[] | null) ?? []
  ).map((s) => {
    const plannedDate = s.plan_item_id
      ? plannedDateByItemId.get(s.plan_item_id) ?? null
      : null;
    return {
      id: s.id,
      date: s.session_date,
      weekKey: isoWeekKey(s.session_date),
      monthKey: monthKey(s.session_date),
      subject: s.subject,
      courseCode: s.course_code,
      activityType: s.activity_type,
      lessonFrom: s.actual_lesson_from,
      lessonTo: s.actual_lesson_to,
      startTime: s.start_time,
      endTime: s.end_time,
      durationMinutes: s.duration_minutes ?? 0,
      status: s.status,
      note: s.note,
      planItemId: s.plan_item_id,
      plannedDate,
      caughtUp: Boolean(plannedDate && plannedDate < s.session_date),
    };
  });

  const assessmentRows: ExportAssessmentRow[] = (
    (attemptsResult.data as AssessmentAttempt[] | null) ?? []
  ).map((a) => ({
    id: a.id,
    date: a.attempt_date,
    weekKey: isoWeekKey(a.attempt_date),
    monthKey: monthKey(a.attempt_date),
    subject: a.subject,
    score: a.score,
    maxScore: a.max_score,
    percentage: a.percentage,
    passingPercentage: a.passing_percentage,
    passed: a.passed,
    totalQuestions: a.total_questions,
    correct: a.correct,
    incorrect: a.incorrect,
    skipped: a.skipped,
    guessed: a.guessed,
    durationMinutes: a.duration_minutes,
    notes: a.notes,
  }));

  // --- per-day rollup -------------------------------------------------------
  const itemsByDate = new Map<string, ExportPlanItemRow[]>();
  for (const row of planItemRows) {
    const arr = itemsByDate.get(row.plannedDate) ?? [];
    arr.push(row);
    itemsByDate.set(row.plannedDate, arr);
  }
  const minutesByDate = new Map<string, number>();
  const sessionsByDate = new Map<string, number>();
  for (const s of sessionRows) {
    minutesByDate.set(s.date, (minutesByDate.get(s.date) ?? 0) + s.durationMinutes);
    sessionsByDate.set(s.date, (sessionsByDate.get(s.date) ?? 0) + 1);
  }
  const attemptsByDate = new Map<string, number>();
  for (const a of assessmentRows) {
    attemptsByDate.set(a.date, (attemptsByDate.get(a.date) ?? 0) + 1);
  }

  const days: ExportDayRow[] = dateRange(range.start, range.end).map((date) => {
    const items = itemsByDate.get(date) ?? [];
    const actualMinutes = minutesByDate.get(date) ?? 0;
    const summary = daySummary({
      items: items.map((i) => ({
        priority: i.priority as "high" | "medium" | "low",
        targetMinutes: i.targetMinutes,
        status: i.status,
      })),
      actualMinutesByItem: [actualMinutes],
    });
    return {
      date,
      weekKey: isoWeekKey(date),
      monthKey: monthKey(date),
      targetMinutes: summary.targetMinutes,
      actualMinutes: summary.actualMinutes,
      timePercent: summary.time.percent,
      taskPercent: summary.taskCompletionPercent,
      weightedPercent: summary.weightedCompletionPercent,
      totalItems: summary.totalItems,
      completedItems: summary.completedItems,
      pendingItems: summary.pendingItems,
      excludedItems: summary.excludedItems,
      sessionCount: sessionsByDate.get(date) ?? 0,
      assessmentCount: attemptsByDate.get(date) ?? 0,
    };
  });

  const minutesBySubject = new Map<string, number>();
  for (const s of sessionRows) {
    const key = s.subject ?? "อื่น ๆ";
    minutesBySubject.set(key, (minutesBySubject.get(key) ?? 0) + s.durationMinutes);
  }

  const targetMinutes = days.reduce((sum, d) => sum + d.targetMinutes, 0);
  const actualMinutes = days.reduce((sum, d) => sum + d.actualMinutes, 0);

  return {
    meta: {
      app: "PrepLoop",
      generatedAt: new Date().toISOString(),
      workspaceName: workspace.name,
      timezone: workspace.timezone,
      rangeKind: range.kind,
      rangeLabel: range.label,
      start: range.start,
      end: range.end,
    },
    totals: {
      days: days.length,
      studiedDays: days.filter((d) => d.actualMinutes > 0).length,
      targetMinutes,
      actualMinutes,
      timePercent:
        targetMinutes > 0
          ? Math.min(100, Math.round((actualMinutes / targetMinutes) * 100))
          : actualMinutes > 0
            ? 100
            : 0,
      sessionCount: sessionRows.length,
      planItems: planItemRows.length,
      completedItems: planItemRows.filter((i) => i.status === "completed").length,
      skippedItems: planItemRows.filter(
        (i) => i.status === "skipped" || i.status === "cancelled"
      ).length,
      assessmentCount: assessmentRows.length,
      minutesBySubject: Array.from(minutesBySubject.entries())
        .map(([subject, minutes]) => ({ subject, minutes }))
        .sort((a, b) => b.minutes - a.minutes),
    },
    days,
    sessions: sessionRows,
    planItems: planItemRows,
    assessments: assessmentRows,
  };
}
