import { createServerSupabase } from "@/lib/supabase/server";
import type { PlanItem, StudySession } from "@/types/db";

export interface SessionPlanMatch {
  session: StudySession;
  planItem: PlanItem | null;
  reason: "plan_item_id" | "source_activity_id" | "assessment_source_id" | "composite" | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function findPlanItemForSession(
  session: StudySession,
  planItems: PlanItem[],
  historicalItems: Array<{ id: string; stable_external_id?: string | null }> = []
): Omit<SessionPlanMatch, "session"> {
  if (session.plan_item_id) {
    const planItem = planItems.find((item) => item.id === session.plan_item_id);
    if (planItem) return { planItem, reason: "plan_item_id" };

    if (historicalItems.length > 0) {
      const hist = historicalItems.find((h) => h.id === session.plan_item_id);
      if (hist?.stable_external_id) {
        const matched = planItems.find(
          (item) => item.stable_external_id === hist.stable_external_id
        );
        if (matched) return { planItem: matched, reason: "source_activity_id" };
      }
    }
  }

  if (session.source_activity_id) {
    const planItem = planItems.find(
      (item) => item.stable_external_id === session.source_activity_id
    );
    if (planItem) return { planItem, reason: "source_activity_id" };
  }

  if (session.assessment_source_external_id) {
    const planItem = planItems.find(
      (item) => item.assessment_source_id === session.assessment_source_external_id
    );
    if (planItem) return { planItem, reason: "assessment_source_id" };
  }

  const composite = planItems.find(
    (item) =>
      item.date === session.session_date &&
      norm(item.subject) === norm(session.subject) &&
      norm(item.activity_type) === norm(session.activity_type) &&
      norm(item.course_code) === norm(session.course_code) &&
      norm(item.lesson_from) === norm(session.actual_lesson_from) &&
      norm(item.lesson_to) === norm(session.actual_lesson_to)
  );
  if (composite) return { planItem: composite, reason: "composite" };

  return { planItem: null, reason: null };
}

export function groupSessionsByPlanItem(
  sessions: StudySession[],
  planItems: PlanItem[],
  historicalItems: Array<{ id: string; stable_external_id?: string | null }> = []
): {
  sessionsByPlanItemId: Map<string, StudySession[]>;
  matches: SessionPlanMatch[];
  unplanned: StudySession[];
} {
  const sessionsByPlanItemId = new Map<string, StudySession[]>();
  const matches: SessionPlanMatch[] = [];
  const unplanned: StudySession[] = [];

  for (const session of sessions) {
    const match = findPlanItemForSession(session, planItems, historicalItems);
    matches.push({ session, ...match });
    if (match.planItem) {
      const arr = sessionsByPlanItemId.get(match.planItem.id) ?? [];
      arr.push(session);
      sessionsByPlanItemId.set(match.planItem.id, arr);
    } else {
      unplanned.push(session);
    }
  }

  return { sessionsByPlanItemId, matches, unplanned };
}

export async function getSessionsForDate(
  workspaceId: string,
  date: string
): Promise<StudySession[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("session_date", date)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  return (data as StudySession[] | null) ?? [];
}
