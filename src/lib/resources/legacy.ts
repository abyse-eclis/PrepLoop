/**
 * Backward compatibility: read old plan items as resources.
 *
 * Plans imported before the hybrid resource model only carry course_code /
 * lesson_from / lesson_to / resource_url / resource_label (+ metadata video
 * links and the canonical catalog). Nothing is migrated or deleted — those
 * items are simply *read* as virtual resources so the two-column UI works for
 * them, and a row is only written when the user changes a status.
 */

import type { PlanItemStatus } from "@/lib/schemas/common";
import {
  getResourceUrlFromMetadata,
  isValidResourceUrl,
  isYoutubeResourceUrl,
} from "@/lib/plans/resource";
import { resolveCanonicalResource } from "@/lib/plans/canonical-resources";
import type { ResourceStatus, ResourceType, StudyResource } from "./types";

/** Item shape shared by the DB row and anything else carrying legacy fields. */
export interface LegacyResourceItem {
  id: string;
  subject?: string | null;
  topic?: string | null;
  instructions?: string | null;
  course_code?: string | null;
  lesson_from?: string | null;
  lesson_to?: string | null;
  activity_type?: string | null;
  resource_url?: string | null;
  resource_label?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const LEGACY_COURSE_KEY = "legacy:course";
export const LEGACY_LINK_KEY = "legacy:link";

/**
 * A URL alone only tells us YouTube vs. "some website" — never invent a more
 * specific type than the data supports.
 */
export function inferResourceTypeFromUrl(url: string): ResourceType {
  return isYoutubeResourceUrl(url) ? "YOUTUBE" : "WEBSITE";
}

/**
 * Legacy items have no per-resource status, so the item's own status is the
 * only honest reading. Once materialised, the resource tracks its own status.
 */
export function resourceStatusFromItemStatus(
  status: PlanItemStatus | null | undefined
): ResourceStatus {
  switch (status) {
    case "completed":
      return "COMPLETED";
    case "studying":
    case "paused":
    case "incomplete":
      return "IN_PROGRESS";
    case "needs_review":
      return "REVIEW_REQUIRED";
    default:
      return "NOT_STARTED";
  }
}

function lessonRangeLabel(item: LegacyResourceItem): string | null {
  if (!item.lesson_from) return null;
  return item.lesson_to && item.lesson_to !== item.lesson_from
    ? `คลิป ${item.lesson_from}–${item.lesson_to}`
    : `คลิป ${item.lesson_from}`;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

/**
 * Resolve the item's legacy link the same way the existing single-link UI does:
 * explicit column first, then metadata, then the canonical catalog.
 */
export function resolveLegacyLink(
  item: LegacyResourceItem
): { url: string; label: string | null } | null {
  if (isValidResourceUrl(item.resource_url)) {
    return { url: item.resource_url, label: firstNonEmpty(item.resource_label) };
  }
  const metaUrl = getResourceUrlFromMetadata(item.metadata);
  if (metaUrl) {
    return { url: metaUrl, label: firstNonEmpty(item.resource_label) };
  }
  const canonical = resolveCanonicalResource(item);
  if (canonical) {
    return {
      url: canonical.url,
      label: firstNonEmpty(item.resource_label, canonical.label),
    };
  }
  return null;
}

/**
 * Derive the virtual resources of an item that has no `study_resources` rows.
 *
 * Mapping (per the hybrid spec):
 *  - course_code            -> PAID  / COURSE   (the purchased course)
 *  - youtube.com | youtu.be -> FREE  / YOUTUBE
 *  - any other http(s) url  -> FREE  / WEBSITE, unless it belongs to the
 *                              purchased course, where it becomes that card's
 *                              link instead of a second card.
 */
export function deriveLegacyResources(
  item: LegacyResourceItem,
  itemStatus?: PlanItemStatus | null
): StudyResource[] {
  const link = resolveLegacyLink(item);
  const status = resourceStatusFromItemStatus(itemStatus);
  const courseCode = firstNonEmpty(item.course_code);
  const linkIsYoutube = link ? isYoutubeResourceUrl(link.url) : false;
  const resources: StudyResource[] = [];

  const base = {
    planItemId: item.id,
    provider: null,
    durationMinutes: null,
    accessType: null,
    expiresAt: null,
    limitedWatchTime: false,
    listenMode: false,
    metadata: null,
    isLegacy: true,
    status,
  } satisfies Partial<StudyResource>;

  if (courseCode) {
    // A non-YouTube link on a course item is that course's own link.
    const courseUrl = link && !linkIsYoutube ? link.url : null;
    resources.push({
      ...base,
      id: `${LEGACY_COURSE_KEY}:${item.id}`,
      legacyKey: LEGACY_COURSE_KEY,
      tier: "PAID",
      type: "COURSE",
      // The lesson range already shows in the card meta line, so it is only a
      // last-resort title.
      title:
        firstNonEmpty(
          item.topic,
          courseUrl ? link?.label : null,
          item.instructions,
          lessonRangeLabel(item)
        ) ?? courseCode,
      url: courseUrl,
      courseCode,
      lessonFrom: firstNonEmpty(item.lesson_from),
      lessonTo: firstNonEmpty(item.lesson_to),
      sortOrder: 0,
    });
  }

  if (link && (linkIsYoutube || !courseCode)) {
    const type = inferResourceTypeFromUrl(link.url);
    resources.push({
      ...base,
      id: `${LEGACY_LINK_KEY}:${item.id}`,
      legacyKey: LEGACY_LINK_KEY,
      tier: "FREE",
      type,
      provider: type === "YOUTUBE" ? "YouTube" : null,
      title:
        firstNonEmpty(link.label, item.topic, lessonRangeLabel(item), item.instructions) ??
        (type === "YOUTUBE" ? "วิดีโอบน YouTube" : "แหล่งเรียนออนไลน์"),
      url: link.url,
      courseCode: courseCode && !linkIsYoutube ? courseCode : null,
      lessonFrom: null,
      lessonTo: null,
      accessType: "FREE",
      sortOrder: resources.length,
    });
  }

  return resources;
}
