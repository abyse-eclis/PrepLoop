import type {
  ItemStatusOverride,
  PlanItem,
  StudySession,
} from "@/types/db";
import type { PlanItemStatus } from "@/lib/schemas/common";
import { statusFromActualMinutes } from "@/lib/study-execution";

export interface PlanItemProgressInput {
  item: PlanItem;
  sessions: StudySession[];
  override?: ItemStatusOverride | null;
}

export interface ResolvedPlanItemProgress {
  item: PlanItem;
  status: PlanItemStatus;
  sessions: StudySession[];
  actualMinutes: number;
}

export interface HistoricalPlanItemRef {
  id: string;
  stable_external_id?: string | null;
}

/**
 * Builds a mapping from plan item id to its matching StudySessions.
 * Matches:
 * 1. Exact `session.plan_item_id === item.id`
 * 2. `session.source_activity_id === item.stable_external_id`
 * 3. Historical plan items: if `session.plan_item_id` belongs to an older version's plan item
 *    that shares the same `stable_external_id` with `item.stable_external_id`.
 */
export function buildPlanItemSessionMap(
  targetItems: PlanItem[],
  sessions: StudySession[],
  historicalItems: HistoricalPlanItemRef[] = []
): Map<string, StudySession[]> {
  const result = new Map<string, StudySession[]>();
  for (const item of targetItems) {
    result.set(item.id, []);
  }

  // Lookup target items by id and stable_external_id
  const targetById = new Map<string, PlanItem>();
  const targetByStableId = new Map<string, PlanItem>();
  for (const item of targetItems) {
    targetById.set(item.id, item);
    if (item.stable_external_id) {
      targetByStableId.set(item.stable_external_id, item);
    }
  }

  // Lookup historical item ID -> stable_external_id
  const historicalIdToStableId = new Map<string, string>();
  for (const h of historicalItems) {
    if (h.id && h.stable_external_id) {
      historicalIdToStableId.set(h.id, h.stable_external_id);
    }
  }

  const assignedSessionIds = new Set<string>();

  for (const s of sessions) {
    // 1. Direct plan_item_id match to target
    if (s.plan_item_id && targetById.has(s.plan_item_id)) {
      result.get(s.plan_item_id)!.push(s);
      assignedSessionIds.add(s.id);
      continue;
    }

    // 2. Direct source_activity_id match to target stable_external_id
    if (s.source_activity_id && targetByStableId.has(s.source_activity_id)) {
      const target = targetByStableId.get(s.source_activity_id)!;
      result.get(target.id)!.push(s);
      assignedSessionIds.add(s.id);
      continue;
    }

    // 3. Historical plan_item_id match via stable_external_id
    if (s.plan_item_id && historicalIdToStableId.has(s.plan_item_id)) {
      const stableId = historicalIdToStableId.get(s.plan_item_id)!;
      if (targetByStableId.has(stableId)) {
        const target = targetByStableId.get(stableId)!;
        result.get(target.id)!.push(s);
        assignedSessionIds.add(s.id);
        continue;
      }
    }
  }

  return result;
}

/**
 * Builds a mapping from plan item id to its matching ItemStatusOverride.
 * Matches:
 * 1. Exact `override.plan_item_id === item.id`
 * 2. Historical plan items: if `override.plan_item_id` belongs to an older version's plan item
 *    that shares the same `stable_external_id` with `item.stable_external_id`.
 */
export function buildPlanItemOverrideMap(
  targetItems: PlanItem[],
  overrides: ItemStatusOverride[],
  historicalItems: HistoricalPlanItemRef[] = []
): Map<string, ItemStatusOverride> {
  const result = new Map<string, ItemStatusOverride>();

  const targetById = new Map<string, PlanItem>();
  const targetByStableId = new Map<string, PlanItem>();
  for (const item of targetItems) {
    targetById.set(item.id, item);
    if (item.stable_external_id) {
      targetByStableId.set(item.stable_external_id, item);
    }
  }

  const historicalIdToStableId = new Map<string, string>();
  for (const h of historicalItems) {
    if (h.id && h.stable_external_id) {
      historicalIdToStableId.set(h.id, h.stable_external_id);
    }
  }

  for (const o of overrides) {
    // 1. Direct plan_item_id match
    if (targetById.has(o.plan_item_id)) {
      result.set(o.plan_item_id, o);
      continue;
    }

    // 2. Historical plan_item_id match via stable_external_id
    if (historicalIdToStableId.has(o.plan_item_id)) {
      const stableId = historicalIdToStableId.get(o.plan_item_id)!;
      if (targetByStableId.has(stableId)) {
        const target = targetByStableId.get(stableId)!;
        // Don't overwrite if target already has direct override
        if (!result.has(target.id)) {
          result.set(target.id, o);
        }
      }
    }
  }

  return result;
}

/**
 * Resolves progress, accumulated actual minutes, and status for a single plan item.
 * SUMs all duration_minutes from matching sessions without filtering by date.
 */
export function resolvePlanItemProgress(
  item: PlanItem,
  sessions: StudySession[],
  override?: ItemStatusOverride | null
): ResolvedPlanItemProgress {
  const actualMinutes = sessions.reduce(
    (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
    0
  );

  const status: PlanItemStatus =
    (override?.status as PlanItemStatus) ??
    statusFromActualMinutes(actualMinutes, item.target_minutes);

  return {
    item,
    status,
    sessions,
    actualMinutes,
  };
}

/**
 * Bulk resolves a list of plan items given sessions, overrides, and historical plan item references.
 */
export function resolvePlanItemsProgress(
  items: PlanItem[],
  sessions: StudySession[],
  overrides: ItemStatusOverride[] = [],
  historicalItems: HistoricalPlanItemRef[] = []
): ResolvedPlanItemProgress[] {
  const sessionMap = buildPlanItemSessionMap(items, sessions, historicalItems);
  const overrideMap = buildPlanItemOverrideMap(items, overrides, historicalItems);

  return items.map((item) =>
    resolvePlanItemProgress(
      item,
      sessionMap.get(item.id) ?? [],
      overrideMap.get(item.id)
    )
  );
}
