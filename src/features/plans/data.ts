import { createServerSupabase } from "@/lib/supabase/server";
import type {
  ItemStatusOverride,
  PlanItem,
  PlanVersion,
  StudySession,
} from "@/types/db";
import type { PlanItemStatus } from "@/lib/schemas/common";
import { classifyQueueState, isQueueActionable, isQueueCompleted, isQueueExcluded, type QueueState } from "@/lib/plans/queue";

export interface ResolvedPlanItem {
  item: PlanItem;
  status: PlanItemStatus;
  sessions: StudySession[];
  actualMinutes: number;
}

export interface StudyQueueData {
  version: PlanVersion | null;
  current: ResolvedPlanItem | null;
  upcoming: ResolvedPlanItem[];
  completedItems: number;
  totalItems: number;
  actualMinutesToday: number;
  todaySessions: StudySession[];
  queueState: QueueState;
  queueError?: string;
}

/** Load only the rolling queue window needed by Today, plus aggregate counts. */
export async function getStudyQueue(
  workspaceId: string,
  date: string,
  upcomingLimit = 7
): Promise<StudyQueueData> {
  const supabase = await createServerSupabase();
  const version = await getActivePlanVersion(workspaceId);
  const empty = { version, current: null, upcoming: [], completedItems: 0, totalItems: 0,
    queueState: "empty" as const };
  const { data: todayRows } = await supabase
    .from("study_sessions").select("*")
    .eq("workspace_id", workspaceId).eq("session_date", date)
    .order("start_time", { ascending: true, nullsFirst: false });
  const todaySessions = (todayRows as StudySession[] | null) ?? [];
  const actualMinutesToday = todaySessions.reduce((sum, s) => sum + Math.max(0, s.duration_minutes ?? 0), 0);
  if (!version) return { ...empty, actualMinutesToday, todaySessions };

  const [{ count: totalItems, error: countError }, { data: overrideRows, error: overrideError }] = await Promise.all([
    supabase.from("study_plan_items").select("id", { count: "exact", head: true }).eq("plan_version_id", version.id),
    supabase.from("item_status_overrides").select("plan_item_id, status, study_plan_items!inner(plan_version_id)")
      .eq("study_plan_items.plan_version_id", version.id),
  ]);
  if (countError || overrideError) {
    return { ...empty, actualMinutesToday, todaySessions, queueState: "inconsistent",
      queueError: countError?.message ?? overrideError?.message ?? "อ่านสถานะแผนไม่สำเร็จ" };
  }
  const rawOverrides = (overrideRows as Array<{ plan_item_id: string; status: string }> | null) ?? [];
  const statusMap = new Map(rawOverrides.map((row) => [row.plan_item_id, row.status]));
  const terminalIds = new Set(rawOverrides.filter((row) => !isQueueActionable(row.status)).map((row) => row.plan_item_id));
  const completedItems = rawOverrides.filter((row) => isQueueCompleted(row.status)).length;
  const excludedItems = rawOverrides.filter((row) => isQueueExcluded(row.status)).length;
  // Fetch in bounded pages so a long completed prefix never causes all plan
  // items to be transferred to the application.
  const window: PlanItem[] = [];
  let offset = 0;
  let queueQueryError: { code?: string; message: string } | null = null;
  while (window.length < upcomingLimit + 1) {
    const { data, error } = await supabase.from("study_plan_items").select("*")
      .eq("plan_version_id", version.id).is("scheduled_at", null)
      .order("order_index", { ascending: true }).range(offset, offset + 99);
    if (error) { queueQueryError = error; break; }
    const page = (data as PlanItem[] | null) ?? [];
    window.push(...page.filter((item) => !terminalIds.has(item.id)));
    if (page.length < 100) break;
    offset += 100;
  }
  // Compatibility bridge for a deployment serving new application code before
  // migration 0011/0012 reached its database. Never hide the PostgREST column
  // error as a falsely completed plan; select using only pre-queue columns and
  // derive the same deterministic legacy order until the migration is applied.
  if (queueQueryError) {
    const legacyRows: PlanItem[] = [];
    offset = 0;
    while (legacyRows.length < (totalItems ?? 0)) {
      const { data, error } = await supabase.from("study_plan_items")
        .select("id, workspace_id, plan_version_id, plan_day_id, date, stable_external_id, subject, course_code, lesson_from, lesson_to, activity_type, assessment_source_id, target_minutes, priority, instructions, resource_url, resource_label, review_reference_ids, metadata, created_at")
        .eq("plan_version_id", version.id).order("date", { ascending: true })
        .order("stable_external_id", { ascending: true }).range(offset, offset + 499);
      if (error) return { ...empty, completedItems, totalItems: totalItems ?? 0,
        actualMinutesToday, todaySessions, queueState: "inconsistent",
        queueError: `อ่านคิวไม่ได้: ${error.message}` };
      const page = ((data as unknown as PlanItem[] | null) ?? []);
      legacyRows.push(...page);
      if (page.length < 500) break;
      offset += 500;
    }
    window.length = 0;
    window.push(...legacyRows.map((item, index) => ({ ...item, order_index: index + 1, scheduled_at: null }))
      .filter((item) => !terminalIds.has(item.id)).slice(0, upcomingLimit + 1));
  }
  const queueItems = window.slice(0, upcomingLimit + 1);
  const ids = queueItems.map((item) => item.id);
  let overrides: ItemStatusOverride[] = [];
  let sessions: StudySession[] = [];
  if (ids.length) {
+    const externalIds = queueItems.map((item) => item.stable_external_id);
    const [{ data: overrideRows }, { data: sessionRows }, { data: legacySessionRows }] = await Promise.all([
      supabase.from("item_status_overrides").select("*").in("plan_item_id", ids),
      supabase.from("study_sessions").select("*").eq("workspace_id", workspaceId).in("plan_item_id", ids),
      supabase.from("study_sessions").select("*").eq("workspace_id", workspaceId)
        .is("plan_item_id", null).in("source_activity_id", externalIds),
    ]);
    overrides = (overrideRows as ItemStatusOverride[] | null) ?? [];
    sessions = [...((sessionRows as StudySession[] | null) ?? []), ...((legacySessionRows as StudySession[] | null) ?? [])];
  }
  const overrideMap = new Map(overrides.map((o) => [o.plan_item_id, o]));
  const resolved = queueItems.map((item): ResolvedPlanItem => {
    const itemSessions = sessions.filter((s) => s.plan_item_id === item.id ||
      (!s.plan_item_id && s.source_activity_id === item.stable_external_id));
    return { item, status: overrideMap.get(item.id)?.status ?? (statusMap.get(item.id) as PlanItemStatus | undefined) ?? "not_started", sessions: itemSessions,
      actualMinutes: itemSessions.reduce((sum, s) => sum + Math.max(0, s.duration_minutes ?? 0), 0) } as ResolvedPlanItem;
  });
  const total = totalItems ?? 0;
  const queueState = classifyQueueState({ totalItems: total, completedItems,
    excludedItems, candidateItems: resolved.length });
  return { version, current: resolved[0] ?? null, upcoming: resolved.slice(1),
    completedItems, totalItems: total, actualMinutesToday, todaySessions, queueState,
    queueError: queueState === "inconsistent" ? "แผนยังมีรายการที่ไม่เสร็จ แต่ไม่สามารถหาลำดับปัจจุบันได้ กรุณาตรวจ migration 0011/0012" : undefined };
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
  const supabase = await createServerSupabase();
  const { data: snap } = await supabase.from("daily_plan_snapshots").select("plan_version_id").eq("workspace_id", workspaceId).eq("snapshot_date", date).maybeSingle();
  let version = snap?.plan_version_id ? null : await resolveVersionForDate(workspaceId, date);
  if (snap?.plan_version_id) {
    const { data: snapVersion } = await supabase.from("study_plan_versions").select("*").eq("id", snap.plan_version_id).maybeSingle();
    version = snapVersion as PlanVersion | null;
  }
  if (!version) return { version: null, items: [] };

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
