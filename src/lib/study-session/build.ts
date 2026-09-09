import type { CustomStudyItem, PlanItem, StudySession } from "@/types/db";
import type { ResolvedPlanItem } from "@/features/plans/data";
import { subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/status";
import { getPlanItemResource } from "@/lib/plans/resource";
import { shouldShowLearningResource } from "@/lib/plans/resource-policy";
import { displayCustomSubject, formatCustomStudyLabel } from "@/lib/constants/exam-categories";
import { buildSessionResource, isHttpUrl } from "./resource";
import { progressPercent, toSessionStatus } from "./status";
import type { SessionHistoryEntry, StudySessionVM } from "./types";

const ASSESSMENT_TYPES = new Set(["diagnostic", "quiz", "exercise", "mock"]);

export const PLAN_ORIGIN_LABEL = "ตามแผน";
export const CUSTOM_ORIGIN_LABEL = "เรียนเสริม";

/** Course catalog lesson used to enrich a plan item with a title and link. */
export interface LessonLookupEntry {
  courseCode: string;
  lessonNumber: string;
  title: string;
  lessonUrl: string | null;
  sourceType: string | null;
}

export type LessonLookup = ReadonlyMap<string, LessonLookupEntry>;

export function lessonLookupKey(courseCode: string, lessonNumber: string): string {
  return `${courseCode}::${lessonNumber}`;
}

export function buildLessonLookup(entries: readonly LessonLookupEntry[]): LessonLookup {
  const map = new Map<string, LessonLookupEntry>();
  for (const e of entries) map.set(lessonLookupKey(e.courseCode, e.lessonNumber), e);
  return map;
}

export function toHistoryEntry(session: StudySession): SessionHistoryEntry {
  return {
    id: session.id,
    sessionDate: session.session_date,
    startTime: session.start_time ?? null,
    endTime: session.end_time ?? null,
    durationMinutes: Math.max(0, session.duration_minutes ?? 0),
    note: session.note ?? null,
  };
}

function lessonRange(item: Pick<PlanItem, "lesson_from" | "lesson_to">): string | null {
  if (!item.lesson_from) return null;
  return item.lesson_to && item.lesson_to !== item.lesson_from
    ? `${item.lesson_from}–${item.lesson_to}`
    : item.lesson_from;
}

/**
 * Project an imported (paid-course) plan item onto the unified session model.
 *
 * Resource resolution: an explicit URL on the item (resource_url / metadata)
 * always wins and is shown for every subject. When the item has none, the
 * course catalog lesson link is used. Curated canonical resources and the
 * "missing resource" warning stay limited to the resource-enabled subjects,
 * exactly as before.
 */
export function buildPlanSessionVM(input: {
  row: ResolvedPlanItem;
  order: number;
  lessons?: LessonLookup;
  blockedReason?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  deferredAt?: string | null;
}): StudySessionVM {
  const { row, order } = input;
  const { item } = row;
  const range = lessonRange(item);
  const lesson =
    item.course_code && item.lesson_from
      ? input.lessons?.get(lessonLookupKey(item.course_code, item.lesson_from)) ?? null
      : null;

  const explicitUrl = isHttpUrl(item.resource_url)
    ? item.resource_url
    : isHttpUrl(item.metadata?.videoUrl)
      ? (item.metadata!.videoUrl as string)
      : isHttpUrl(item.metadata?.resourceUrl)
        ? (item.metadata!.resourceUrl as string)
        : null;

  const resourceEnabled = shouldShowLearningResource(item.subject);
  const curated = resourceEnabled ? getPlanItemResource(item) : null;

  const resource =
    buildSessionResource(explicitUrl, { sourceName: item.resource_label }) ??
    buildSessionResource(lesson?.lessonUrl, {
      sourceName: lesson?.sourceType,
      sourceType: lesson?.sourceType,
    }) ??
    (curated ? buildSessionResource(curated.url, { sourceName: curated.sourceName }) : null);

  const activity = activityLabel(item.activity_type);
  const title = lesson
    ? `${lesson.title}`
    : range
      ? `${activity} · คลิป ${range}`
      : activity;

  const subtitleParts = [
    item.course_code ? `คอร์ส ${item.course_code}` : null,
    lesson && range ? `คลิป ${range}` : null,
    lesson ? activity : null,
    `ลำดับที่ ${item.order_index}`,
  ].filter(Boolean);

  const status = toSessionStatus(row.status, row.actualMinutes);
  const isAssessment = ASSESSMENT_TYPES.has(item.activity_type);

  return {
    key: `plan:${item.id}`,
    source: { kind: "plan", id: item.id },
    subjectLabel: subjectLabel(item.subject),
    originLabel: PLAN_ORIGIN_LABEL,
    title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : null,
    instructions: item.instructions?.trim() ? item.instructions.trim() : null,
    plannedMinutes: Math.max(0, item.target_minutes),
    actualMinutes: row.actualMinutes,
    progressPercent: progressPercent(row.actualMinutes, item.target_minutes),
    status,
    rawStatus: row.status,
    notes: input.notes ?? null,
    history: row.sessions.map(toHistoryEntry),
    completedAt: input.completedAt ?? null,
    scheduledDate: item.date,
    order,
    deferredAt: status === "deferred" ? (input.deferredAt ?? null) : null,
    resource,
    missingResource: resourceEnabled && !resource,
    blockedReason: input.blockedReason ?? null,
    detailsHref: `/plan?item=${encodeURIComponent(item.stable_external_id)}`,
    assessmentHref: isAssessment ? `/assessments?item=${item.id}` : null,
    editable: false,
  };
}

/** Project a free / self-added resource onto the unified session model. */
export function buildCustomSessionVM(input: {
  item: CustomStudyItem;
  sessions: StudySession[];
  order: number;
}): StudySessionVM {
  const { item, sessions, order } = input;
  const actualMinutes = sessions.reduce(
    (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
    0
  );
  const planned = Math.max(0, item.estimated_minutes ?? 0);
  const status = toSessionStatus(item.status, actualMinutes);
  const resource = buildSessionResource(item.url);

  return {
    key: `custom:${item.id}`,
    source: { kind: "custom", id: item.id },
    subjectLabel: displayCustomSubject(item.subject, item.custom_subject),
    originLabel: CUSTOM_ORIGIN_LABEL,
    title: item.title,
    subtitle: formatCustomStudyLabel(item.exam_category, item.subject, item.custom_subject),
    instructions: null,
    plannedMinutes: planned,
    actualMinutes,
    progressPercent: progressPercent(actualMinutes, planned),
    status,
    rawStatus: item.status,
    notes: item.notes?.trim() ? item.notes.trim() : null,
    history: sessions.map(toHistoryEntry),
    completedAt: item.completed_at ?? null,
    scheduledDate: item.study_date,
    order,
    deferredAt: status === "deferred" ? (item.deferred_at ?? null) : null,
    resource,
    missingResource: false,
    blockedReason: null,
    detailsHref: null,
    assessmentHref: null,
    editable: true,
  };
}

/**
 * Re-project an edited custom item onto an existing session, keeping the
 * learning history and status the server already reconciled.
 */
export function applyCustomItemToSession(
  session: StudySessionVM,
  item: CustomStudyItem
): StudySessionVM {
  const planned = Math.max(0, item.estimated_minutes ?? 0);
  return {
    ...session,
    subjectLabel: displayCustomSubject(item.subject, item.custom_subject),
    title: item.title,
    subtitle: formatCustomStudyLabel(item.exam_category, item.subject, item.custom_subject),
    plannedMinutes: planned,
    progressPercent: progressPercent(session.actualMinutes, planned),
    notes: item.notes?.trim() ? item.notes.trim() : null,
    resource: buildSessionResource(item.url),
  };
}
