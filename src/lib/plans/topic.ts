/**
 * The heading of a plan item.
 *
 * What is being learned outranks where it comes from: the topic is the title,
 * while the course code lives on the resource card. Items imported before
 * `topic` existed fall back to their instructions, then their lesson range.
 */

import { subjectLabel } from "@/lib/subjects";

export interface TopicSource {
  topic?: string | null;
  instructions?: string | null;
  lesson_from?: string | null;
  lesson_to?: string | null;
  resource_label?: string | null;
  subject?: string | null;
}

const MAX_TOPIC_LENGTH = 90;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const firstLine = value.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) return null;
  return firstLine.length > MAX_TOPIC_LENGTH
    ? `${firstLine.slice(0, MAX_TOPIC_LENGTH - 1).trimEnd()}…`
    : firstLine;
}

export function lessonRangeText(item: TopicSource): string | null {
  if (!item.lesson_from) return null;
  return item.lesson_to && item.lesson_to !== item.lesson_from
    ? `คลิป ${item.lesson_from}–${item.lesson_to}`
    : `คลิป ${item.lesson_from}`;
}

/** Never empty — falls back to the subject label, then a neutral placeholder. */
export function planItemTopic(item: TopicSource): string {
  return (
    clean(item.topic) ??
    clean(item.instructions) ??
    lessonRangeText(item) ??
    clean(item.resource_label) ??
    (item.subject ? subjectLabel(item.subject) : null) ??
    "รายการเรียน"
  );
}

/** True when the heading already is the subject, so the subline can drop it. */
export function topicIsSubject(item: TopicSource): boolean {
  return (
    !clean(item.topic) &&
    !clean(item.instructions) &&
    !lessonRangeText(item) &&
    !clean(item.resource_label)
  );
}
