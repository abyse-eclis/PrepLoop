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

export interface StudyQueueData {
  version: PlanVersion | null;
  current: ResolvedPlanItem | null;
  upcoming: ResolvedPlanItem[];
  completedItems: number;
  totalItems: number;
  actualMinutesToday: number;
  todaySessions: StudySession[];
}

const QUEUE_TERMINAL_STATUSES = ["completed", "cancelled"];

/** Load only the rolling queue window needed by Today, plus aggregate counts. */
export async function getStudyQueue(
  workspaceId: string,
  date: string,
  upcomingLimit = 7
): Promise<StudyQueueData> {
  const supabase = await createServerSupabase();
  const version = await getActivePlanVersion(workspaceId);
  const empty = { version, current: null, upcoming: [], completedItems: 0, totalItems: 0 };
  const { data: todayRows } = await supabase
    .from("study_sessions").select("*")
    .eq("workspace_id", workspaceId).eq("session_date", date)
    .order("start_time", { ascending: true, nullsFirst: false });
  const todaySessions = (todayRows as StudySession[] | null) ?? [];
  const actualMinutesToday = todaySessions.reduce((sum, s) => sum + Math.max(0, s.duration_minutes ?? 0), 0);
  if (!version) return { ...empty, actualMinutesToday, todaySessions };

  const [{ count: totalItems }, { data: terminalRows }] = await Promise.all([
    supabase.from("study_plan_items").select("id", { count: "exact", head: true }).eq("plan_version_id", version.id),
    supabase.from("item_status_overrides").select("plan_item_id, status, study_plan_items!inner(plan_version_id)")
      .eq("study_plan_items.plan_version_id", version.id).in("status", QUEUE_TERMINAL_STATUSES),
  ]);
  const terminalIds = new Set(((terminalRows as Array<{ plan_item_id: string }> | null) ?? []).map((r) => r.plan_item_id));
  // Fetch in bounded pages so a long completed prefix never causes all plan
  // items to be transferred to the application.
  const window: PlanItem[] = [];
  let offset = 0;
  while (window.length < upcomingLimit + 1) {
    const { data } = await supabase.from("study_plan_items").select("*")
      .eq("plan_version_id", version.id).is("scheduled_at", null)
      .order("order_index", { ascending: true }).range(offset, offset + 99);
    const page = (data as PlanItem[] | null) ?? [];
    window.push(...page.filter((item) => !terminalIds.has(item.id)));
    if (page.length < 100) break;
    offset += 100;
  }
  const queueItems = window.slice(0, upcomingLimit + 1);
  const ids = queueItems.map((item) => item.id);
  let overrides: ItemStatusOverride[] = [];
  let sessions: StudySession[] = [];
  if (ids.length) {
    const [{ data: overrideRows }, { data: sessionRows }] = await Promise.all([
      supabase.from("item_status_overrides").select("*").in("plan_item_id", ids),
      supabase.from("study_sessions").select("*").in("plan_item_id", ids),
    ]);
    overrides = (overrideRows as ItemStatusOverride[] | null) ?? [];
    sessions = (sessionRows as StudySession[] | null) ?? [];
  }
  const overrideMap = new Map(overrides.map((o) => [o.plan_item_id, o]));
  const resolved = queueItems.map((item): ResolvedPlanItem => {
    const itemSessions = sessions.filter((s) => s.plan_item_id === item.id);
    return { item, status: overrideMap.get(item.id)?.status ?? "not_started", sessions: itemSessions,
      actualMinutes: itemSessions.reduce((sum, s) => sum + Math.max(0, s.duration_minutes ?? 0), 0) } as ResolvedPlanItem;
  });
  return { version, current: resolved[0] ?? null, upcoming: resolved.slice(1),
    completedItems: terminalIds.size, totalItems: totalItems ?? 0, actualMinutesToday, todaySessions };
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
