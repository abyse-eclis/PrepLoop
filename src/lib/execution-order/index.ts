import type { OrderedTaskRef } from "@/types/db";

export interface PrerequisiteCheckResult {
  isBlocked: boolean;
  reason?: string;
  prerequisites?: string[];
}

export type OrderedInputItem = string | OrderedTaskRef | { id: string; type?: string };

/**
 * Extracts string IDs from an array of either string IDs or OrderedTaskRef objects.
 */
export function normalizeOrderedIds(
  orderedItems: OrderedInputItem[] | null | undefined
): string[] {
  if (!orderedItems || !Array.isArray(orderedItems)) return [];
  return orderedItems
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter((id): id is string => Boolean(id && typeof id === "string"));
}

/**
 * Sorts an array of items according to a custom execution order list of IDs.
 * Items present in customOrderIds appear in that exact order.
 * Items not in customOrderIds are appended at the end preserving their original relative order.
 * Items present in customOrderIds but missing from items are ignored.
 * Does NOT mutate the input array.
 */
export function applyExecutionOrder<T extends { item?: { id: string }; id?: string }>(
  items: T[],
  customOrderIds: OrderedInputItem[] | null | undefined
): T[] {
  if (!items || items.length === 0) return [];
  const orderIds = normalizeOrderedIds(customOrderIds);
  if (orderIds.length === 0) return [...items];

  const getItemId = (item: T): string => item.id ?? item.item?.id ?? "";

  const itemMap = new Map<string, T>();
  for (const it of items) {
    const id = getItemId(it);
    if (id) itemMap.set(id, it);
  }

  const result: T[] = [];
  const placedIds = new Set<string>();

  for (const id of orderIds) {
    const it = itemMap.get(id);
    if (it && !placedIds.has(id)) {
      result.push(it);
      placedIds.add(id);
    }
  }

  for (const it of items) {
    const id = getItemId(it);
    if (!placedIds.has(id)) {
      result.push(it);
      placedIds.add(id);
    }
  }

  return result;
}

export interface PrerequisiteContext {
  /** Map of courseCode -> Set of completed lesson numbers (e.g. "01", "02") */
  completedLessonsByCourse?: Map<string, Set<string>>;
  /** Set of completed lesson external IDs / IDs */
  completedLessonIds?: Set<string>;
  /** Map of lesson external_id / lesson_number -> prerequisite lesson numbers or IDs */
  lessonPrerequisites?: Map<string, string[]>;
  /** Map of assessmentSourceId / externalId -> required completed lesson numbers */
  assessmentRequiredLessons?: Map<string, string[]>;
}

/**
 * Checks if a task has any unfinished prerequisites.
 * Pure function: does not perform network calls.
 */
export function checkTaskPrerequisites(
  task: {
    course_code?: string | null;
    lesson_from?: string | null;
    lesson_to?: string | null;
    assessment_source_id?: string | null;
    activity_type?: string;
  },
  context: PrerequisiteContext = {}
): PrerequisiteCheckResult {
  const {
    completedLessonsByCourse = new Map(),
    completedLessonIds = new Set(),
    lessonPrerequisites = new Map(),
    assessmentRequiredLessons = new Map(),
  } = context;

  // 1. Check assessment required lessons
  if (task.assessment_source_id) {
    const required = assessmentRequiredLessons.get(task.assessment_source_id);
    if (required && required.length > 0) {
      const courseLessons = task.course_code
        ? completedLessonsByCourse.get(task.course_code) ?? new Set()
        : new Set<string>();

      const missing = required.filter(
        (lesson: string) => !courseLessons.has(lesson) && !completedLessonIds.has(lesson)
      );

      if (missing.length > 0) {
        return {
          isBlocked: true,
          reason: `ต้องเรียนบท ${missing.join(", ")} ให้เสร็จก่อน`,
          prerequisites: missing,
        };
      }
    }
  }

  // 2. Check course lesson prerequisites
  if (task.course_code && task.lesson_from) {
    const prereqs =
      lessonPrerequisites.get(task.lesson_from) ??
      (task.lesson_to ? lessonPrerequisites.get(task.lesson_to) : null);

    if (prereqs && prereqs.length > 0) {
      const courseLessons = completedLessonsByCourse.get(task.course_code) ?? new Set();

      const missing = prereqs.filter(
        (prereq: string) =>
          !courseLessons.has(prereq) && !completedLessonIds.has(prereq)
      );

      if (missing.length > 0) {
        return {
          isBlocked: true,
          reason: `ต้องเรียนบท/คลิป ${missing.join(", ")} ให้เสร็จก่อน`,
          prerequisites: missing,
        };
      }
    }
  }

  return { isBlocked: false };
}
