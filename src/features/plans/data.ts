import { createServerSupabase } from "@/lib/supabase/server";
import type {
  ItemStatusOverride,
  PlanDay,
  PlanItem,
  PlanVersion,
  StudySession,
} from "@/types/db";
import type { PlanItemStatus } from "@/lib/schemas/common";

export const PLAN_VERSION_COLUMNS = [
  "id",
  "workspace_id",
  "parent_version_id",
  "version_number",
  "name",
  "description",
  "start_date",
  "end_date",
  "status",
  "generated_by",
  "change_reason",
  "effective_from",
  "effective_to",
  "created_at",
  "activated_at",
  "archived_at",
].join(",");

export const PLAN_ITEM_COLUMNS = [
  "id",
  "workspace_id",
  "plan_version_id",
  "plan_day_id",
  "date",
  "stable_external_id",
  "subject",
  "course_code",
  "lesson_from",
  "lesson_to",
  "activity_type",
  "assessment_source_id",
  "target_minutes",
  "priority",
  "instructions",
  "review_reference_ids",
  "metadata",
  "created_at",
].join(",");

export const STUDY_SESSION_COLUMNS = [
  "id",
  "workspace_id",
  "plan_item_id",
  "subject",
  "session_date",
  "start_time",
  "end_time",
  "duration_minutes",
  "status",
  "actual_lesson_from",
  "actual_lesson_to",
  "note",
  "created_at",
  "updated_at",
].join(",");

const STATUS_OVERRIDE_COLUMNS =
  "id, plan_item_id, status, actual_lesson_from, actual_lesson_to";

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
    .select(PLAN_VERSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .in("status", ["active", "superseded"])
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .order("version_number", { ascending: false });

  const versions = (data as PlanVersion[] | null) ?? [];
  for (const v of versions) {
    const from = v.effective_from ?? v.start_date;
    const to = v.effective_to;
    if (from <= date && (to === null || to >= date)) {
      return v;
    }
  }
  return versions[0] ?? null;
}

export async function getActivePlanVersion(
  workspaceId: string
): Promise<PlanVersion | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_versions")
    .select(PLAN_VERSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PlanVersion | null) ?? null;
}

export async function getPlanVersionSummaries(
  workspaceId: string
): Promise<PlanVersion[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_versions")
    .select(PLAN_VERSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("version_number", { ascending: false });
  return (data as PlanVersion[] | null) ?? [];
}

export async function getPlanDayTarget(
  workspaceId: string,
  planVersionId: string,
  date: string
): Promise<Pick<PlanDay, "target_minutes" | "nap_target_minutes"> | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_days")
    .select("target_minutes, nap_target_minutes")
    .eq("workspace_id", workspaceId)
    .eq("plan_version_id", planVersionId)
    .eq("date", date)
    .maybeSingle();
  return data as Pick<PlanDay, "target_minutes" | "nap_target_minutes"> | null;
}

export async function getPlanItemsForVersion(
  workspaceId: string,
  planVersionId: string,
  options: {
    start?: string;
    end?: string;
    limit?: number;
    ascending?: boolean;
  } = {}
): Promise<PlanItem[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("plan_version_id", planVersionId)
    .order("date", { ascending: options.ascending ?? true })
    .order("priority", { ascending: true });

  if (options.start) query = query.gte("date", options.start);
  if (options.end) query = query.lte("date", options.end);
  if (options.limit) query = query.limit(options.limit);

  const { data } = await query;
  return (data as PlanItem[] | null) ?? [];
}

export async function resolvePlanItems(
  workspaceId: string,
  items: PlanItem[]
): Promise<ResolvedPlanItem[]> {
  if (items.length === 0) return [];

  const supabase = await createServerSupabase();
  const itemIds = items.map((i) => i.id);

  const [{ data: overrides }, { data: sessions }] = await Promise.all([
    supabase
      .from("item_status_overrides")
      .select(STATUS_OVERRIDE_COLUMNS)
      .eq("workspace_id", workspaceId)
      .in("plan_item_id", itemIds),
    supabase
      .from("study_sessions")
      .select(STUDY_SESSION_COLUMNS)
      .eq("workspace_id", workspaceId)
      .in("plan_item_id", itemIds)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true }),
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

  return items.map((item) => {
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
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("plan_version_id", version.id)
    .eq("date", date)
    .order("priority", { ascending: true });

  const items = (itemRows as PlanItem[] | null) ?? [];
  if (items.length === 0) return { version, items: [] };

  return { version, items: await resolvePlanItems(workspaceId, items) };
}
