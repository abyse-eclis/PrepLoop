import { createServerSupabase } from "@/lib/supabase/server";
import { getItemsForDate } from "@/features/plans/data";
import { daySummary, timeCompletion } from "@/lib/calculations";
import { addDays, isoWeekKey, monthKey } from "@/lib/dates";
import type { AssessmentAttempt, StudySession } from "@/types/db";

export interface DailyProgress {
  date: string;
  targetMinutes: number;
  actualMinutes: number;
  timePercent: number;
  taskPercent: number;
  weightedPercent: number;
  sessionCount: number;
  completedItems: number;
  totalItems: number;
  pendingItems: number;
  reviewDue: number;
  attemptCount: number;
  planVersionName: string | null;
}

export async function getDailyProgress(
  workspaceId: string,
  date: string
): Promise<DailyProgress> {
  const { version, items } = await getItemsForDate(workspaceId, date);

  const supabase = await createServerSupabase();
  const [
    { data: sessionRows, count: sessionCount },
    { count: reviewDue },
    { count: attemptCount },
  ] =
    await Promise.all([
      supabase
        .from("study_sessions")
        .select("duration_minutes", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("session_date", date),
      supabase
        .from("review_tasks")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .eq("due_date", date),
      supabase
        .from("assessment_attempts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("attempt_date", date),
    ]);
  const actualMinutes = (
    (sessionRows as Array<{ duration_minutes: number }> | null) ?? []
  ).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const summary = daySummary({
    items: items.map((r) => ({
      priority: r.item.priority,
      targetMinutes: r.item.target_minutes,
      status: r.status,
    })),
    actualMinutesByItem: [actualMinutes],
  });

  return {
    date,
    targetMinutes: summary.targetMinutes,
    actualMinutes: summary.actualMinutes,
    timePercent: summary.time.percent,
    taskPercent: summary.taskCompletionPercent,
    weightedPercent: summary.weightedCompletionPercent,
    sessionCount: sessionCount ?? 0,
    completedItems: summary.completedItems,
    totalItems: summary.totalItems,
    pendingItems: summary.pendingItems,
    reviewDue: reviewDue ?? 0,
    attemptCount: attemptCount ?? 0,
    planVersionName: version?.name ?? null,
  };
}

export interface RangeProgress {
  start: string;
  end: string;
  targetMinutes: number;
  actualMinutes: number;
  timePercent: number;
  minutesBySubject: Array<{ subject: string; minutes: number }>;
  daysMet: number;
  totalDays: number;
  attemptCount: number;
  passRate: number | null;
  averagePercentage: number | null;
  overdueReviews: number;
  recoveryCount: number;
}

/** Aggregate sessions/attempts/plan across an inclusive date range. */
export async function getRangeProgress(
  workspaceId: string,
  start: string,
  end: string
): Promise<RangeProgress> {
  const supabase = await createServerSupabase();
  const [
    { data: sessions },
    { data: attempts },
    { data: planItems },
    { count: overdue },
    { count: recoveries },
  ] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("subject, session_date, duration_minutes")
      .eq("workspace_id", workspaceId)
      .gte("session_date", start)
      .lte("session_date", end),
    supabase
      .from("assessment_attempts")
      .select("percentage, passed")
      .eq("workspace_id", workspaceId)
      .gte("attempt_date", start)
      .lte("attempt_date", end),
    supabase
      .from("study_plan_days")
      .select("date, target_minutes")
      .eq("workspace_id", workspaceId)
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("review_tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .lt("due_date", start),
    supabase
      .from("study_plan_versions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("generated_by", "claude_recovery"),
  ]);

  const sessionRows = (sessions as StudySession[] | null) ?? [];
  const actualByDate = new Map<string, number>();
  const bySubject = new Map<string, number>();
  for (const s of sessionRows) {
    actualByDate.set(
      s.session_date,
      (actualByDate.get(s.session_date) ?? 0) + s.duration_minutes
    );
    const subj = s.subject ?? "อื่น ๆ";
    bySubject.set(subj, (bySubject.get(subj) ?? 0) + s.duration_minutes);
  }

  // Use distinct plan days for target; if none, derive from sessions' dates.
  const targetByDate = new Map<string, number>();
  for (const d of (planItems as Array<{ date: string; target_minutes: number }> | null) ?? []) {
    targetByDate.set(d.date, d.target_minutes);
  }
  const targetMinutes = Array.from(targetByDate.values()).reduce((a, b) => a + b, 0);
  const actualMinutes = Array.from(actualByDate.values()).reduce((a, b) => a + b, 0);

  let daysMet = 0;
  for (const [date, target] of targetByDate) {
    const actual = actualByDate.get(date) ?? 0;
    if (target > 0 && actual >= target * 0.8) daysMet++;
  }

  const attemptRows = (attempts as AssessmentAttempt[] | null) ?? [];
  const withPct = attemptRows.filter((a) => a.percentage !== null);
  const passRate =
    attemptRows.length > 0
      ? Math.round(
          (attemptRows.filter((a) => a.passed).length / attemptRows.length) * 100
        )
      : null;
  const averagePercentage =
    withPct.length > 0
      ? Math.round(
          (withPct.reduce((s, a) => s + (a.percentage ?? 0), 0) / withPct.length) * 10
        ) / 10
      : null;

  return {
    start,
    end,
    targetMinutes,
    actualMinutes,
    timePercent: timeCompletion(actualMinutes, targetMinutes).percent,
    minutesBySubject: Array.from(bySubject.entries())
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    daysMet,
    totalDays: targetByDate.size,
    attemptCount: attemptRows.length,
    passRate,
    averagePercentage,
    overdueReviews: overdue ?? 0,
    recoveryCount: recoveries ?? 0,
  };
}

export function weekBounds(dateKey: string): { start: string; end: string } {
  // ISO week: Monday..Sunday
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = date.getUTCDay() || 7;
  const monday = addDays(dateKey, -(day - 1));
  return { start: monday, end: addDays(monday, 6) };
}

export function monthBounds(dateKey: string): { start: string; end: string } {
  const [y, m] = dateKey.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const end = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    lastDay
  ).padStart(2, "0")}`;
  return { start, end };
}

export { isoWeekKey, monthKey };
