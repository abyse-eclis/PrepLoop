import { createServerSupabase } from "@/lib/supabase/server";
import type {
  ItemStatusOverride,
  PlanDay,
  PlanItem,
  PlanVersion,
  StudySession,
} from "@/types/db";
import type { PlanItemStatus } from "@/lib/schemas/common";
import { selectVersionForDate } from "@/lib/plans/version";
import { resolvePlanItemsProgress } from "@/lib/plans/progress";

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
  "resource_url",
  "resource_label",
  "review_reference_ids",
  "metadata",
  "created_at",
].join(",");

export const STUDY_SESSION_COLUMNS = [
  "id",
  "workspace_id",
  "plan_item_id",
  "subject",
  "source_activity_id",
  "assessment_source_external_id",
  "activity_type",
  "course_code",
  "session_date",
  "start_time",
  "end_time",
  "duration_minutes",
  "status",
  "actual_lesson_from",
  "actual_lesson_to",
  "note",
  "score",
  "max_score",
  "correct",
  "incorrect",
  "total_questions",
  "lesson_code",
  "lesson_title",
  "lesson_url",
  "source_type",
  "result",
  "completed",
  "video_progress_start",
  "video_progress_end",
  "custom_study_item_id",
  "exam_category",
  "import_dedup_key",
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
    .in("status", ["active", "superseded", "draft"])
    .lte("start_date", date)
    .gte("end_date", date)
    .order("version_number", { ascending: false });

  return selectVersionForDate((data as PlanVersion[] | null) ?? [], date);
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

/**
 * Load plan items in a date range across ALL versions of the workspace.
 *
 * Carry-over spans versions: work planned under v1 stays owed even after a
 * recovery plan (v2) takes over from today. Callers filter each item against
 * the version that owns its date (see `versionIdsByDate`).
 */
export async function getPlanItemsInRange(
  workspaceId: string,
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
    .order("date", { ascending: options.ascending ?? true })
    .order("priority", { ascending: true });

  if (options.start) query = query.gte("date", options.start);
  if (options.end) query = query.lte("date", options.end);
  if (options.limit) query = query.limit(options.limit);

  const { data } = await query;
  return (data as PlanItem[] | null) ?? [];
}

export async function getPlanItemByExternalId(
  workspaceId: string,
  planVersionId: string,
  stableExternalId: string
): Promise<PlanItem | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("plan_version_id", planVersionId)
    .eq("stable_external_id", stableExternalId)
    .maybeSingle();
  return (data as PlanItem | null) ?? null;
}

export async function resolvePlanItems(
  workspaceId: string,
  items: PlanItem[]
): Promise<ResolvedPlanItem[]> {
  if (items.length === 0) return [];

  const supabase = await createServerSupabase();

  const [{ data: overrides }, { data: sessions }] = await Promise.all([
    supabase
      .from("item_status_overrides")
      .select(STATUS_OVERRIDE_COLUMNS)
      .eq("workspace_id", workspaceId),
    supabase
      .from("study_sessions")
      .select(STUDY_SESSION_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  const allOverrides = (overrides as ItemStatusOverride[] | null) ?? [];
  const allSessions = (sessions as StudySession[] | null) ?? [];

  const referencedIds = [
    ...new Set([
      ...allSessions.map((s) => s.plan_item_id).filter(Boolean),
      ...allOverrides.map((o) => o.plan_item_id).filter(Boolean),
    ]),
  ] as string[];

  let historicalRows: Array<{ id: string; stable_external_id: string | null }> = [];
  if (referencedIds.length > 0) {
    const { data: hist } = await supabase
      .from("study_plan_items")
      .select("id, stable_external_id")
      .eq("workspace_id", workspaceId)
      .in("id", referencedIds);
    historicalRows = (hist as Array<{ id: string; stable_external_id: string | null }> | null) ?? [];
  }

  return resolvePlanItemsProgress(
    items,
    allSessions,
    allOverrides,
    historicalRows
  );
}

/**
 * Load plan items for a date with their execution status and sessions merged.
 */
export async function getItemsForDate(
  workspaceId: string,
  date: string
): Promise<{ version: PlanVersion | null; items: ResolvedPlanItem[] }> {
  const supabase = await createServerSupabase();
  const { data: snap } = await supabase
    .from("daily_plan_snapshots")
    .select("plan_version_id")
    .eq("workspace_id", workspaceId)
    .eq("snapshot_date", date)
    .maybeSingle();
  let version = snap?.plan_version_id
    ? null
    : await resolveVersionForDate(workspaceId, date);
  if (snap?.plan_version_id) {
    const { data: snapVersion } = await supabase
      .from("study_plan_versions")
      .select(PLAN_VERSION_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", snap.plan_version_id)
      .maybeSingle();
    version = snapVersion as PlanVersion | null;
  }
  if (!version) return { version: null, items: [] };

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
