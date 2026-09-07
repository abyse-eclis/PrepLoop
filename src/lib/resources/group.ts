/**
 * Splitting and counting resources per tier.
 *
 * Paid and free progress are always reported separately: finishing a free
 * YouTube recap never means the purchased course is finished, and LISTENED
 * ("ฟังผ่านแล้ว", e.g. played in the background during freelance work) is not
 * completion either.
 */

import {
  isResourceCompleted,
  type ResourceStatus,
  type ResourceTier,
  type StudyResource,
} from "./types";

export interface ResourceGroups {
  paid: StudyResource[];
  free: StudyResource[];
  total: number;
}

export interface ResourceProgress {
  total: number;
  completed: number;
  listened: number;
  inProgress: number;
  reviewRequired: number;
  notStarted: number;
  /** Share of resources marked COMPLETED. LISTENED never counts here. */
  percent: number;
}

function compareResources(a: StudyResource, b: StudyResource): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title, "th");
}

export function groupResourcesByTier(
  resources: StudyResource[]
): ResourceGroups {
  const paid: StudyResource[] = [];
  const free: StudyResource[] = [];
  for (const resource of resources) {
    (resource.tier === "PAID" ? paid : free).push(resource);
  }
  paid.sort(compareResources);
  free.sort(compareResources);
  return { paid, free, total: paid.length + free.length };
}

export function summarizeResourceProgress(
  resources: StudyResource[]
): ResourceProgress {
  const counts: Record<ResourceStatus, number> = {
    NOT_STARTED: 0,
    LISTENED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    REVIEW_REQUIRED: 0,
  };
  for (const resource of resources) counts[resource.status] += 1;

  const total = resources.length;
  const completed = resources.filter((r) => isResourceCompleted(r.status)).length;

  return {
    total,
    completed,
    listened: counts.LISTENED,
    inProgress: counts.IN_PROGRESS,
    reviewRequired: counts.REVIEW_REQUIRED,
    notStarted: counts.NOT_STARTED,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/** Per-tier progress. Deliberately never merged into one number. */
export function summarizeResourceGroups(groups: ResourceGroups): Record<
  ResourceTier,
  ResourceProgress
> {
  return {
    PAID: summarizeResourceProgress(groups.paid),
    FREE: summarizeResourceProgress(groups.free),
  };
}
