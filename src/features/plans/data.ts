import { createServerSupabase } from "@/lib/supabase/server";
import type {
  ItemStatusOverride,
  PlanItem,
  PlanVersion,
  StudySession,
} from "@/types/db";
import type { PlanItemStatus } from "@/lib/schemas/common";

export interface ResolvedPlanItem {
  item: PlanItem;
  status: PlanItemStatus;
  sessions: StudySession[];
  actualMinutes: number;
}

/**
 * Resolve which plan version is effective on a given date.
 * Immutable history: past dates keep referencing the version that was in
 * effect then (via effective_from/effective_to ranges).
 */
export async function resolveVersionForDate(
  workspaceId: string,
  date: string
): Promise<PlanVersion | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["active", "superseded", "draft"])
    .lte("start_date", date)
    .gte("end_date", date)
    .order("version_number", { ascending: false });

  const versions = (data as PlanVersion[] | null) ?? [];
  const effective = versions
    .filter((v) => v.status !== "draft")
    .filter((v) => {
      const from = v.effective_from ?? v.start_date;
      const to = v.effective_to ?? v.end_date;
      return from <= date && to >= date;
    })
    .sort((a, b) => {
      const fromCmp = (b.effective_from ?? b.start_date).localeCompare(
        a.effective_from ?? a.start_date
      );
      return fromCmp || b.version_number - a.version_number;
    });

  return effective[0] ?? versions.find((v) => v.status === "draft") ?? null;
}

export async function getActivePlanVersion(
  workspaceId: string
): Promise<PlanVersion | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PlanVersion | null) ?? null;
}

/**
 * Load plan items for a date with their execution status and sessions merged.
 */
export async function getItemsForDate(
  workspaceId: string,
  date: string
): Promise<{ version: PlanVersion | null; items: ResolvedPlanItem[] }> {
  const version = await resolveVersionForDate(workspaceId, date);
  if (!version) return { version: null, items: [] };

  const supabase = await createServerSupabase();
  const { data: itemRows } = await supabase
    .from("study_plan_items")
    .select("*")
    .eq("plan_version_id", version.id)
    .eq("date", date)
    .order("priority", { ascending: true });

  const items = (itemRows as PlanItem[] | null) ?? [];
  if (items.length === 0) return { version, items: [] };

  const itemIds = items.map((i) => i.id);

  const [{ data: overrides }, { data: sessions }] = await Promise.all([
    supabase
      .from("item_status_overrides")
      .select("*")
      .in("plan_item_id", itemIds),
    supabase
      .from("study_sessions")
      .select("*")
      .in("plan_item_id", itemIds),
  ]);

  const overrideMap = new Map<string, ItemStatusOverride>(
    ((overrides as ItemStatusOverride[] | null) ?? []).map((o) => [
      o.plan_item_id,
      o,
    ])
  );
  const sessionMap = new Map<string, StudySession[]>();
  for (const s of (sessions as StudySession[] | null) ?? []) {
    if (!s.plan_item_id) continue;
    const arr = sessionMap.get(s.plan_item_id) ?? [];
    arr.push(s);
    sessionMap.set(s.plan_item_id, arr);
  }

  const resolved: ResolvedPlanItem[] = items.map((item) => {
    const itemSessions = sessionMap.get(item.id) ?? [];
    const actualMinutes = itemSessions.reduce(
      (sum, s) => sum + (s.duration_minutes ?? 0),
      0
    );
    const override = overrideMap.get(item.id);
    return {
      item,
      status: (override?.status as PlanItemStatus) ?? "not_started",
      sessions: itemSessions,
      actualMinutes,
    };
  });

  return { version, items: resolved };
}
