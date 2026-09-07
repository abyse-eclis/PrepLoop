/**
 * Turning DB rows into the resources the UI renders.
 *
 * An item with stored `study_resources` rows uses only those — they are
 * authoritative. An item without any is read from its legacy columns
 * (`deriveLegacyResources`), so plans imported before this feature keep working
 * without a data migration.
 */

import type { PlanItemStatus } from "@/lib/schemas/common";
import type { StudyResourceRow } from "@/types/db";
import { deriveLegacyResources, type LegacyResourceItem } from "./legacy";
import {
  isResourceAccessType,
  isResourceStatus,
  isResourceTier,
  isResourceType,
  type StudyResource,
} from "./types";

/** Map a DB row, falling back to safe values if a column ever holds junk. */
export function toStudyResource(row: StudyResourceRow): StudyResource {
  return {
    id: row.id,
    planItemId: row.study_plan_item_id,
    tier: isResourceTier(row.tier) ? row.tier : "FREE",
    type: isResourceType(row.type) ? row.type : "WEBSITE",
    provider: row.provider ?? null,
    title: row.title,
    url: row.url ?? null,
    courseCode: row.course_code ?? null,
    lessonFrom: row.lesson_from ?? null,
    lessonTo: row.lesson_to ?? null,
    durationMinutes: row.duration_minutes ?? null,
    status: isResourceStatus(row.status) ? row.status : "NOT_STARTED",
    accessType: isResourceAccessType(row.access_type) ? row.access_type : null,
    expiresAt: row.expires_at ?? null,
    limitedWatchTime: row.limited_watch_time ?? false,
    listenMode: row.listen_mode ?? false,
    sortOrder: row.sort_order ?? 0,
    metadata: row.metadata ?? null,
    isLegacy: false,
    legacyKey: row.legacy_key ?? null,
  };
}

export function groupRowsByItem(
  rows: StudyResourceRow[]
): Map<string, StudyResource[]> {
  const byItem = new Map<string, StudyResource[]>();
  for (const row of rows) {
    const list = byItem.get(row.study_plan_item_id) ?? [];
    list.push(toStudyResource(row));
    byItem.set(row.study_plan_item_id, list);
  }
  return byItem;
}

/**
 * Resources of one item: its stored rows, plus any legacy resource the columns
 * still describe that no stored row already covers.
 *
 * Matching by legacy key, URL or course code means a plan imported in the new
 * format (whose legacy columns mirror its primary resource) shows each source
 * once, while a half-materialised legacy item never loses a card.
 */
export function resolveItemResources(
  item: LegacyResourceItem,
  storedByItem: Map<string, StudyResource[]>,
  itemStatus?: PlanItemStatus | null
): StudyResource[] {
  const stored = storedByItem.get(item.id) ?? [];
  const legacy = deriveLegacyResources(item, itemStatus);
  if (stored.length === 0) return legacy;
  if (legacy.length === 0) return stored;

  const storedKeys = new Set(
    stored.map((r) => r.legacyKey).filter((k): k is string => Boolean(k))
  );
  const storedUrls = new Set(
    stored
      .map((r) => r.url?.trim().toLowerCase())
      .filter((u): u is string => Boolean(u))
  );
  const storedCourseCodes = new Set(
    stored
      .map((r) => r.courseCode?.trim().toUpperCase())
      .filter((c): c is string => Boolean(c))
  );

  const maxSortOrder = stored.reduce((max, r) => Math.max(max, r.sortOrder), 0);
  const extras = legacy
    .filter((resource) => {
      if (resource.legacyKey && storedKeys.has(resource.legacyKey)) return false;
      if (resource.url && storedUrls.has(resource.url.trim().toLowerCase())) {
        return false;
      }
      if (
        resource.courseCode &&
        storedCourseCodes.has(resource.courseCode.trim().toUpperCase())
      ) {
        return false;
      }
      return true;
    })
    .map((resource, index) => ({
      ...resource,
      sortOrder: maxSortOrder + 1 + index,
    }));

  return [...stored, ...extras];
}
