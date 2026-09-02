import type { PlanItem } from "@/types/db";
import type { PlanItemInput } from "@/lib/schemas/study-plan";
import { isValidResourceUrl, normalizeResourceLabel } from "@/lib/plans/resource";

export interface PreservedPlanItemContent {
  stable_external_id: string;
  subject: string;
  course_code: string | null;
  lesson_from: string | null;
  lesson_to: string | null;
  activity_type: string;
  assessment_source_id: string | null;
  target_minutes: number;
  priority: "high" | "medium" | "low";
  instructions: string | null;
  resource_url: string | null;
  resource_label: string | null;
  review_reference_ids: string[] | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Safely merge metadata dictionaries without discarding existing fields.
 * Any incoming overrides are merged, and extra tags (e.g. { recovery: true }) are appended.
 */
export function mergeItemMetadata(
  sourceMeta?: Record<string, unknown> | null,
  incomingMeta?: Record<string, unknown> | null,
  extraTags?: Record<string, unknown> | null
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {
    ...(sourceMeta ?? {}),
    ...(incomingMeta ?? {}),
    ...(extraTags ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Resolve resource URL and label from direct fields or metadata fallbacks.
 */
export function resolveResourceFields(
  item: {
    resource_url?: string | null;
    resource_label?: string | null;
    resourceUrl?: string | null;
    resourceLabel?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  sourceItem?: {
    resource_url?: string | null;
    resource_label?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null
): {
  resourceUrl: string | null;
  resourceLabel: string | null;
} {
  // 1. Check direct field on item
  let url = isValidResourceUrl(item.resource_url)
    ? item.resource_url
    : isValidResourceUrl(item.resourceUrl)
      ? item.resourceUrl
      : null;

  let label = item.resource_label ?? item.resourceLabel ?? null;

  // 2. Check metadata on item
  if (!url && item.metadata) {
    if (isValidResourceUrl(item.metadata.videoUrl)) {
      url = item.metadata.videoUrl as string;
    } else if (isValidResourceUrl(item.metadata.resourceUrl)) {
      url = item.metadata.resourceUrl as string;
    }
  }

  // 3. Fallback to source item if item doesn't specify one
  if (!url && sourceItem) {
    if (isValidResourceUrl(sourceItem.resource_url)) {
      url = sourceItem.resource_url;
    } else if (sourceItem.metadata) {
      if (isValidResourceUrl(sourceItem.metadata.videoUrl)) {
        url = sourceItem.metadata.videoUrl as string;
      } else if (isValidResourceUrl(sourceItem.metadata.resourceUrl)) {
        url = sourceItem.metadata.resourceUrl as string;
      }
    }
    if (!label) {
      label = sourceItem.resource_label ?? null;
    }
  }

  return {
    resourceUrl: url,
    resourceLabel: label ? (typeof label === "string" ? label.trim() : null) : null,
  };
}

/**
 * Preserve all core content fields when cloning, transforming, or creating
 * a new plan item version from a source item or recovery definition.
 */
export function preservePlanItemFields(
  incoming: Partial<PlanItemInput> & {
    stableExternalId: string;
    resource_url?: string | null;
    resource_label?: string | null;
  },
  sourceItem?: PlanItem | null,
  options?: {
    extraMetadata?: Record<string, unknown>;
  }
): PreservedPlanItemContent {
  const { resourceUrl, resourceLabel } = resolveResourceFields(
    incoming,
    sourceItem
  );

  const mergedMetadata = mergeItemMetadata(
    sourceItem?.metadata,
    incoming.metadata,
    options?.extraMetadata
  );

  return {
    stable_external_id: incoming.stableExternalId,
    subject: incoming.subject ?? sourceItem?.subject ?? "OTHER",
    course_code:
      incoming.courseCode !== undefined
        ? incoming.courseCode
        : (sourceItem?.course_code ?? null),
    lesson_from:
      incoming.lessonFrom !== undefined
        ? incoming.lessonFrom
        : (sourceItem?.lesson_from ?? null),
    lesson_to:
      incoming.lessonTo !== undefined
        ? incoming.lessonTo
        : (sourceItem?.lesson_to ?? null),
    activity_type:
      incoming.activityType ?? sourceItem?.activity_type ?? "course",
    assessment_source_id:
      incoming.assessmentSourceId !== undefined
        ? incoming.assessmentSourceId
        : (sourceItem?.assessment_source_id ?? null),
    target_minutes:
      incoming.targetMinutes ?? sourceItem?.target_minutes ?? 60,
    priority: incoming.priority ?? sourceItem?.priority ?? "medium",
    instructions:
      incoming.instructions !== undefined
        ? incoming.instructions
        : (sourceItem?.instructions ?? ""),
    resource_url: resourceUrl,
    resource_label: resourceLabel,
    review_reference_ids:
      incoming.reviewReferenceIds !== undefined
        ? incoming.reviewReferenceIds
        : (sourceItem?.review_reference_ids ?? []),
    metadata: mergedMetadata,
  };
}
