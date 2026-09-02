import type { PlanItem } from "@/types/db";
import type { PlanItemInput } from "@/lib/schemas/study-plan";
import { isValidResourceUrl } from "@/lib/plans/resource";
import { resolveCanonicalResource } from "@/lib/plans/canonical-resources";

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
 * Normalize text for semantic topic comparison.
 */
function normalizeTopicText(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict check to determine if target and donor represent the same learning content.
 * Prevents assigning resources from mismatched topics even if stableExternalId matches.
 */
export function isSameLearningContent(
  target: {
    subject?: string | null;
    activity_type?: string | null;
    activityType?: string | null;
    course_code?: string | null;
    courseCode?: string | null;
    lesson_from?: string | null;
    lessonFrom?: string | null;
    lesson_to?: string | null;
    lessonTo?: string | null;
    instructions?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  donor: {
    subject?: string | null;
    activity_type?: string | null;
    activityType?: string | null;
    course_code?: string | null;
    courseCode?: string | null;
    lesson_from?: string | null;
    lessonFrom?: string | null;
    lesson_to?: string | null;
    lessonTo?: string | null;
    instructions?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): boolean {
  // 1. Subject check: if both provide subject, they must match
  const targetSubj = target.subject?.trim().toUpperCase();
  const donorSubj = donor.subject?.trim().toUpperCase();
  if (targetSubj && donorSubj && targetSubj !== donorSubj) return false;

  // 2. Course code check: if both provide course code, they must match
  const targetCourse = (target.course_code ?? target.courseCode)?.trim();
  const donorCourse = (donor.course_code ?? donor.courseCode)?.trim();
  if (targetCourse && donorCourse && targetCourse !== donorCourse) {
    return false;
  }

  // 3. Lesson range check: if both provide lessons, they must match
  const targetFrom = (target.lesson_from ?? target.lessonFrom)?.trim();
  const donorFrom = (donor.lesson_from ?? donor.lessonFrom)?.trim();
  if (targetFrom && donorFrom && targetFrom !== donorFrom) {
    return false;
  }

  const targetTo = (target.lesson_to ?? target.lessonTo)?.trim();
  const donorTo = (donor.lesson_to ?? donor.lessonTo)?.trim();
  if (targetTo && donorTo && targetTo !== donorTo) {
    return false;
  }

  // 4. Metadata modes (englishMode, resourceKey, contentKey)
  const targetMode = target.metadata?.englishMode ?? target.metadata?.mode;
  const donorMode = donor.metadata?.englishMode ?? donor.metadata?.mode;
  if (targetMode && donorMode && targetMode !== donorMode) {
    return false;
  }

  const targetResKey = target.metadata?.resourceKey ?? target.metadata?.contentKey;
  const donorResKey = donor.metadata?.resourceKey ?? donor.metadata?.contentKey;
  if (targetResKey && donorResKey && targetResKey !== donorResKey) {
    return false;
  }

  // 5. Instructions / topic comparison
  const targetNorm = normalizeTopicText(target.instructions);
  const donorNorm = normalizeTopicText(donor.instructions);

  if (targetNorm && donorNorm) {
    if (targetNorm === donorNorm) return true;

    // Common generic recovery phrases like "ทบทวน", "ทบทวนบทเรียน"
    const genericPhrases = ["ทบทวน", "ทบทวนบทเรียน", "review", "practice"];
    if (genericPhrases.includes(targetNorm) || genericPhrases.includes(donorNorm)) {
      return true;
    }

    // Check if one contains the other
    if (targetNorm.includes(donorNorm) || donorNorm.includes(targetNorm)) {
      return true;
    }

    // Check word token overlap
    const targetWords = new Set(targetNorm.split(" ").filter((w) => w.length > 2));
    const donorWords = new Set(donorNorm.split(" ").filter((w) => w.length > 2));

    if (targetWords.size > 0 && donorWords.size > 0) {
      let common = 0;
      for (const w of targetWords) {
        if (donorWords.has(w)) common++;
      }
      const overlap = common / Math.min(targetWords.size, donorWords.size);
      if (overlap >= 0.4) return true;
    }

    // If modes were explicitly specified and matched, allow instruction differences (e.g. daily variations)
    if (targetMode && donorMode && targetMode === donorMode) {
      return true;
    }
    if (targetCourse && donorCourse && targetCourse === donorCourse) {
      return true;
    }

    // Completely different instruction topic and no shared course/mode
    return false;
  }

  return true;
}

/**
 * Resolve resource URL and label from direct fields, metadata fallbacks,
 * canonical catalog, or safe semantic donor item.
 */
export function resolveResourceFields(
  item: {
    subject?: string | null;
    activity_type?: string | null;
    activityType?: string | null;
    course_code?: string | null;
    courseCode?: string | null;
    lesson_from?: string | null;
    lessonFrom?: string | null;
    lesson_to?: string | null;
    lessonTo?: string | null;
    instructions?: string | null;
    resource_url?: string | null;
    resource_label?: string | null;
    resourceUrl?: string | null;
    resourceLabel?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  sourceItem?: {
    subject?: string | null;
    activity_type?: string | null;
    activityType?: string | null;
    course_code?: string | null;
    courseCode?: string | null;
    lesson_from?: string | null;
    lessonFrom?: string | null;
    lesson_to?: string | null;
    lessonTo?: string | null;
    instructions?: string | null;
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

  // 3. Check canonical resource catalog
  if (!url) {
    const canonical = resolveCanonicalResource(item);
    if (canonical) {
      url = canonical.url;
      if (!label) label = canonical.label;
    }
  }

  // 4. Fallback to source item ONLY if semantic content identity matches
  if (!url && sourceItem && isSameLearningContent(item, sourceItem)) {
    if (isValidResourceUrl(sourceItem.resource_url)) {
      url = sourceItem.resource_url;
    } else if (sourceItem.metadata) {
      if (isValidResourceUrl(sourceItem.metadata.videoUrl)) {
        url = sourceItem.metadata.videoUrl as string;
      } else if (isValidResourceUrl(sourceItem.metadata.resourceUrl)) {
        url = sourceItem.metadata.resourceUrl as string;
      }
    }

    if (!url) {
      const canonicalSource = resolveCanonicalResource(sourceItem);
      if (canonicalSource) {
        url = canonicalSource.url;
        if (!label) label = canonicalSource.label;
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
