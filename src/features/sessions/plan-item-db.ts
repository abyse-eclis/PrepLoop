import { createServerSupabase } from "@/lib/supabase/server";

export interface OwnedPlanItem {
  id: string;
  workspace_id: string;
  subject: string;
  date: string;
  lesson_from: string | null;
  lesson_to: string | null;
  target_minutes: number;
  stable_external_id: string | null;
  plan_version_id: string;
}

/** Load a plan item and confirm it belongs to the caller's workspace. */
export async function ownedPlanItem(
  planItemId: string,
  workspaceId: string
): Promise<OwnedPlanItem | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_items")
    .select(
      "id, workspace_id, subject, date, lesson_from, lesson_to, target_minutes, stable_external_id, plan_version_id"
    )
    .eq("id", planItemId)
    .maybeSingle();
  if (!data || data.workspace_id !== workspaceId) return null;
  return data as OwnedPlanItem;
}

/**
 * Freeze the plan of the item's day the first time it is touched, so later
 * plan versions never rewrite what the learner actually saw that day.
 * No-op once a snapshot exists for that date.
 */
export async function ensureDailySnapshot(
  workspaceId: string,
  item: Pick<OwnedPlanItem, "date" | "plan_version_id">,
  reason: string
): Promise<void> {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase
    .from("daily_plan_snapshots")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("snapshot_date", item.date)
    .maybeSingle();
  if (existing) return;
  const { data: items } = await supabase
    .from("study_plan_items")
    .select(
      "id, stable_external_id, subject, course_code, lesson_from, lesson_to, activity_type, target_minutes, priority, instructions"
    )
    .eq("workspace_id", workspaceId)
    .eq("plan_version_id", item.plan_version_id)
    .eq("date", item.date)
    .order("priority", { ascending: true });
  await supabase.from("daily_plan_snapshots").insert({
    workspace_id: workspaceId,
    snapshot_date: item.date,
    plan_version_id: item.plan_version_id,
    payload: { items: items ?? [] },
    started_reason: reason,
  });
}

/** Ids of every version's copy of this plan item (same stable external id). */
export async function siblingPlanItemIds(
  workspaceId: string,
  item: Pick<OwnedPlanItem, "id" | "stable_external_id">
): Promise<string[]> {
  if (!item.stable_external_id) return [item.id];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_items")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("stable_external_id", item.stable_external_id);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((s) => s.id);
  return ids.length > 0 ? ids : [item.id];
}
