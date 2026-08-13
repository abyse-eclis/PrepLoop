import { createServerSupabase } from "@/lib/supabase/server";
import {
  PLAN_ITEM_COLUMNS,
  STUDY_SESSION_COLUMNS,
} from "@/features/plans/data";
import type { PlanItem, StudySession } from "@/types/db";

export interface StudySessionWithPlan {
  session: StudySession;
  item: PlanItem | null;
}

export async function getStudySessionsForDate(
  workspaceId: string,
  date: string
): Promise<StudySessionWithPlan[]> {
  const supabase = await createServerSupabase();
  const { data: sessionData } = await supabase
    .from("study_sessions")
    .select(STUDY_SESSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("session_date", date)
    .order("start_time", { ascending: true });

  const sessions = (sessionData as StudySession[] | null) ?? [];
  const itemIds = Array.from(
    new Set(sessions.map((s) => s.plan_item_id).filter((id): id is string => Boolean(id)))
  );

  const itemMap = new Map<string, PlanItem>();
  if (itemIds.length > 0) {
    const { data: itemData } = await supabase
      .from("study_plan_items")
      .select(PLAN_ITEM_COLUMNS)
      .eq("workspace_id", workspaceId)
      .in("id", itemIds);
    for (const item of (itemData as PlanItem[] | null) ?? []) {
      itemMap.set(item.id, item);
    }
  }

  return sessions.map((session) => ({
    session,
    item: session.plan_item_id ? itemMap.get(session.plan_item_id) ?? null : null,
  }));
}

