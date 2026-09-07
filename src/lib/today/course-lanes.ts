/**
 * Today as two independent learning streams.
 *
 * The page is one paid lane and one free lane, so every resource planned for
 * today becomes a card of its own: the plan item it came from supplies the
 * subject, topic, target and timer state, but is never drawn as a container.
 *
 * Presentation only — nothing here reads or writes the database.
 */

import type { PlanItem } from "@/types/db";
import type { PlanItemStatus } from "@/lib/schemas/common";
import type { ExecutionState } from "@/lib/study-execution";
import type { PrerequisiteCheckResult } from "@/lib/execution-order";
import type { ResourceTier, StudyResource } from "@/lib/resources/types";
import { resourceRole } from "@/lib/resources/presentation";
import { planItemTopic } from "@/lib/plans/topic";

/** The queue shape this selector needs; `QueuePlanItem` satisfies it. */
export interface LaneSourceItem {
  item: Pick<
    PlanItem,
    | "id"
    | "subject"
    | "topic"
    | "instructions"
    | "course_code"
    | "lesson_from"
    | "lesson_to"
    | "activity_type"
    | "target_minutes"
    | "resource_label"
  >;
  status: PlanItemStatus;
  actualMinutes: number;
  executionState: ExecutionState;
  resources: StudyResource[];
  prerequisiteStatus?: PrerequisiteCheckResult;
}

export type LaneKey = "PAID" | "FREE" | "OTHER";

export interface CourseLaneCard {
  /** Stable React key; also the dedupe identity. */
  key: string;
  lane: LaneKey;
  /** null only for a plan item that names no source at all. */
  resource: StudyResource | null;
  planItemId: string;
  subject: string;
  topic: string;
  activityType: string;
  /** Card heading, e.g. "M110 — จำนวนจริง". */
  title: string;
  /** Provider / course name under the heading. */
  sourceLine: string | null;
  targetMinutes: number;
  actualMinutes: number;
  progressPercent: number;
  itemStatus: PlanItemStatus;
  executionState: ExecutionState;
  /** 1-based position of the parent item in today's queue. */
  queuePosition: number;
  /** First actionable item of the day — badged instead of given its own section. */
  isCurrent: boolean;
  isBlocked: boolean;
  blockedReason?: string;
}

export interface TodayCourseLanes {
  paid: CourseLaneCard[];
  free: CourseLaneCard[];
  /** Plan work with no learning source (mocks, rest, review-only items). */
  other: CourseLaneCard[];
  /** Cards across every lane — used for the "N รายการ" header count. */
  total: number;
}

/** Free lane ordering after the topic in progress: repair, then prep, then recap. */
const FREE_ROLE_RANK: Record<string, number> = {
  ERROR_REPAIR: 0,
  FOUNDATION: 1,
  PREVIEW: 1,
  RECAP: 2,
  SUPPLEMENT: 3,
};
const FREE_ROLE_RANK_DEFAULT = 2.5;

function laneOf(resource: StudyResource): ResourceTier {
  return resource.tier === "PAID" ? "PAID" : "FREE";
}

/**
 * Identity of a card for deduplication.
 *
 * A v8 plan can describe the same purchased course twice — once through the
 * item's legacy `course_code` and once as a PAID resource — so cards collapse
 * on tier + course code + url within one plan item. When a resource has
 * neither, its title is the only thing that identifies it.
 */
export function cardDedupeKey(
  resource: StudyResource,
  planItemId: string
): string {
  const courseCode = resource.courseCode?.trim().toUpperCase() ?? "";
  const url = resource.url?.trim().toLowerCase() ?? "";
  const identity =
    courseCode || url ? `${courseCode}|${url}` : `title:${resource.title.trim()}`;
  return `${resource.tier}|${identity}|${planItemId}`;
}

function lessonRange(resource: StudyResource): string | null {
  if (!resource.lessonFrom) return null;
  return resource.lessonTo && resource.lessonTo !== resource.lessonFrom
    ? `${resource.lessonFrom}–${resource.lessonTo}`
    : resource.lessonFrom;
}

/**
 * "M110 — จำนวนจริง" for a course, the resource's own name otherwise: on a
 * purchased course the code plus what is being studied today says more than
 * the course's marketing title, which moves to the source line.
 */
export function cardTitle(resource: StudyResource, topic: string): string {
  const courseCode = resource.courseCode?.trim();
  if (!courseCode) return resource.title;
  const subject = topic.trim() || resource.title;
  return `${courseCode} — ${subject}`;
}

export function cardSourceLine(
  resource: StudyResource,
  title: string
): string | null {
  const parts: string[] = [];
  if (resource.provider?.trim()) parts.push(resource.provider.trim());
  const name = resource.title.trim();
  if (name && !title.includes(name) && !parts.includes(name)) parts.push(name);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function progressPercent(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

function toCard(
  entry: LaneSourceItem,
  resource: StudyResource | null,
  lane: LaneKey,
  queuePosition: number,
  isCurrent: boolean
): CourseLaneCard {
  const topic = planItemTopic(entry.item);
  const title = resource ? cardTitle(resource, topic) : topic;
  const range = resource ? lessonRange(resource) : null;

  return {
    key: resource
      ? cardDedupeKey(resource, entry.item.id)
      : `item:${entry.item.id}`,
    lane,
    resource,
    planItemId: entry.item.id,
    subject: entry.item.subject,
    topic,
    activityType: entry.item.activity_type,
    title: range && !title.includes(range) ? `${title} (${range})` : title,
    sourceLine: resource ? cardSourceLine(resource, title) : null,
    targetMinutes: entry.item.target_minutes,
    actualMinutes: entry.actualMinutes,
    progressPercent: progressPercent(
      entry.actualMinutes,
      entry.item.target_minutes
    ),
    itemStatus: entry.status,
    executionState: entry.executionState,
    queuePosition,
    isCurrent,
    isBlocked: Boolean(entry.prerequisiteStatus?.isBlocked),
    blockedReason: entry.prerequisiteStatus?.reason,
  };
}

/**
 * Flatten today's queue into a paid stream and a free stream.
 *
 * Items keep their plan order in the paid lane. The free lane leads with the
 * sources for whatever is being studied right now, then error repair, prep,
 * and recap — a free clip is chosen by what it is for, not by which item it
 * happens to hang off.
 */
export function buildCourseLanes(
  entries: LaneSourceItem[]
): TodayCourseLanes {
  const paid: CourseLaneCard[] = [];
  const free: CourseLaneCard[] = [];
  const other: CourseLaneCard[] = [];
  const seen = new Map<string, CourseLaneCard>();
  const sortOrderByKey = new Map<string, number>();
  const legacyByKey = new Map<string, boolean>();

  entries.forEach((entry, index) => {
    const queuePosition = index + 1;
    const isCurrent = index === 0;

    if (entry.resources.length === 0) {
      other.push(toCard(entry, null, "OTHER", queuePosition, isCurrent));
      return;
    }

    for (const resource of entry.resources) {
      const card = toCard(
        entry,
        resource,
        laneOf(resource),
        queuePosition,
        isCurrent
      );

      const existing = seen.get(card.key);
      if (existing) {
        // A stored resource always wins over the same source read from the
        // item's legacy columns.
        if (!existing.resource?.isLegacy || resource.isLegacy) continue;
        const target = existing.lane === "PAID" ? paid : free;
        target.splice(target.indexOf(existing), 1, card);
        seen.set(card.key, card);
        sortOrderByKey.set(card.key, resource.sortOrder);
        legacyByKey.set(card.key, resource.isLegacy);
        continue;
      }

      seen.set(card.key, card);
      sortOrderByKey.set(card.key, resource.sortOrder);
      legacyByKey.set(card.key, resource.isLegacy);
      (card.lane === "PAID" ? paid : free).push(card);
    }
  });

  paid.sort(
    (a, b) =>
      a.queuePosition - b.queuePosition ||
      (sortOrderByKey.get(a.key) ?? 0) - (sortOrderByKey.get(b.key) ?? 0) ||
      a.title.localeCompare(b.title, "th")
  );

  free.sort((a, b) => {
    const currentRank = Number(!a.isCurrent) - Number(!b.isCurrent);
    if (currentRank !== 0) return currentRank;
    const roleRank = freeRoleRank(a) - freeRoleRank(b);
    if (roleRank !== 0) return roleRank;
    return (
      a.queuePosition - b.queuePosition ||
      (sortOrderByKey.get(a.key) ?? 0) - (sortOrderByKey.get(b.key) ?? 0) ||
      a.title.localeCompare(b.title, "th")
    );
  });

  return { paid, free, other, total: paid.length + free.length + other.length };
}

function freeRoleRank(card: CourseLaneCard): number {
  const role = card.resource ? resourceRole(card.resource) : null;
  return role ? (FREE_ROLE_RANK[role] ?? FREE_ROLE_RANK_DEFAULT) : FREE_ROLE_RANK_DEFAULT;
}
