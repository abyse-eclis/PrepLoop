import { createServerSupabase } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import type { ReviewTask } from "@/types/db";

export const REVIEW_TASK_COLUMNS = [
  "id",
  "workspace_id",
  "source_type",
  "source_ref",
  "subject",
  "course_code",
  "lesson_from",
  "lesson_to",
  "rule",
  "due_date",
  "reason",
  "instructions",
  "status",
  "result",
  "next_review_date",
].join(",");

export interface ReviewPageData {
  evidence: {
    studySessions: number;
    assessmentAttempts: number;
    weaknesses: number;
    pendingReviews: number;
  };
  pendingReviews: ReviewTask[];
  recentDone: ReviewTask[];
}

export async function getReviewPageData(
  workspaceId: string,
  today: string
): Promise<ReviewPageData> {
  const supabase = await createServerSupabase();
  const nextWeek = addDays(today, 7);

  const [
    { count: studySessions },
    { count: assessmentAttempts },
    { count: weaknesses },
    { count: pendingReviewCount },
    { data: pendingData },
    { data: doneData },
  ] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("assessment_attempts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("assessment_topic_results")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_weakness", true),
    supabase
      .from("review_tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
    supabase
      .from("review_tasks")
      .select(REVIEW_TASK_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .lte("due_date", nextWeek)
      .order("due_date", { ascending: true })
      .limit(100),
    supabase
      .from("review_tasks")
      .select(REVIEW_TASK_COLUMNS)
      .eq("workspace_id", workspaceId)
      .neq("status", "pending")
      .order("due_date", { ascending: false })
      .limit(20),
  ]);

  return {
    evidence: {
      studySessions: studySessions ?? 0,
      assessmentAttempts: assessmentAttempts ?? 0,
      weaknesses: weaknesses ?? 0,
      pendingReviews: pendingReviewCount ?? 0,
    },
    pendingReviews: (pendingData as ReviewTask[] | null) ?? [],
    recentDone: (doneData as ReviewTask[] | null) ?? [],
  };
}

