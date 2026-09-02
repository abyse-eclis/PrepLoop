import { getPlanItemResource } from "@/lib/plans/resource";
import type { PlanItem } from "@/types/db";

export const RESOURCE_ENABLED_SUBJECTS = [
  "A_LEVEL_ENGLISH",
  "TGAT1",
] as const;

export type ResourceEnabledSubject = (typeof RESOURCE_ENABLED_SUBJECTS)[number];

const RESOURCE_ENABLED_SUBJECT_SET = new Set<string>(RESOURCE_ENABLED_SUBJECTS);

/**
 * Determines whether a given subject should display learning resource buttons,
 * links, or missing-resource warnings in the UI (e.g. /today, /plan) and repair workflows.
 *
 * PrepLoop only enables curated learning resources for English subjects:
 * 1. A_LEVEL_ENGLISH
 * 2. TGAT1
 *
 * Other subjects (MATHEMATICS, PHYSICS, TPAT3, TGAT2, TGAT3, etc.) will not render
 * resource action buttons or missing warnings.
 */
export function shouldShowLearningResource(
  subject: string | null | undefined
): boolean {
  if (!subject) return false;
  return RESOURCE_ENABLED_SUBJECT_SET.has(subject);
}

export type PlanItemResourceDisplayState =
  | {
      type: "link";
      resource: NonNullable<ReturnType<typeof getPlanItemResource>>;
    }
  | {
      type: "missing_warning";
      resource: null;
    }
  | {
      type: "none";
      resource: null;
    };

/**
 * Returns the unified resource display state for any plan item.
 * - Non-English subjects -> type: "none" (no button, no warning)
 * - English subjects with resource -> type: "link"
 * - English subjects without resource -> type: "missing_warning"
 */
export function getPlanItemResourceDisplayState(
  item: PlanItem
): PlanItemResourceDisplayState {
  if (!shouldShowLearningResource(item.subject)) {
    return { type: "none", resource: null };
  }

  const resource = getPlanItemResource(item);
  if (resource) {
    return { type: "link", resource };
  }

  return { type: "missing_warning", resource: null };
}
