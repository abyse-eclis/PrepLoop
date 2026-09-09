/**
 * Unified Study Session model for the Today page.
 *
 * A "study session" is one card in today's learning queue, regardless of
 * whether it comes from an imported (paid-course) study plan or from a free /
 * self-added resource. Both sources are projected onto this shape on the
 * server, so the client never branches on the source for business logic —
 * only the badge, icon and resource link differ.
 */

/** Semantic status shared by every source. */
export type SessionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  /** "ถัดไป": still owed, but the learner wants to do something else first. */
  | "deferred"
  /** "ข้าม": will not be studied. Never used to mean deferred. */
  | "skipped";

/** Status transitions a learner can trigger from a card. */
export type SessionStatusAction = "completed" | "pending" | "deferred" | "skipped";

export type SessionSourceKind = "plan" | "custom";

export interface SessionSource {
  kind: SessionSourceKind;
  /** study_plan_items.id or custom_study_items.id */
  id: string;
}

export type ResourceKind = "smartmathpro" | "youtube" | "document" | "link";

export interface SessionResource {
  url: string;
  kind: ResourceKind;
  /** Button label, e.g. "เปิด SmartMathPro". */
  label: string;
  /** Provider / channel name when known, e.g. "English by Chris". */
  sourceName: string | null;
}

/** One logged study interval — the learning history of a session. */
export interface SessionHistoryEntry {
  id: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  note: string | null;
}

export interface StudySessionVM {
  /** Stable React key: `${source.kind}:${source.id}` */
  key: string;
  source: SessionSource;
  /** Display label of the subject, e.g. "คณิตศาสตร์". */
  subjectLabel: string;
  /** Where the session comes from: "ตามแผน" or "เรียนเสริม". */
  originLabel: string;
  /** Course / lesson title. */
  title: string;
  /** Resource information line (course code, lesson range, activity). */
  subtitle: string | null;
  /** Free-text instructions from the plan, if any. */
  instructions: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  /** 0–100, capped. */
  progressPercent: number;
  status: SessionStatus;
  /** Raw persisted status, kept for diagnostics and export parity. */
  rawStatus: string;
  notes: string | null;
  history: SessionHistoryEntry[];
  completedAt: string | null;
  /** The date this session belongs to (plan legacy date / custom study_date). */
  scheduledDate: string;
  /** Base position in today's queue before deferral reordering. */
  order: number;
  deferredAt: string | null;
  resource: SessionResource | null;
  /** True when the subject expects a learning resource but none is set. */
  missingResource: boolean;
  /** Prerequisite reason when the item is blocked, else null. */
  blockedReason: string | null;
  /** "ดูรายละเอียด" target, when the source has a detail page. */
  detailsHref: string | null;
  /** "กรอกผลสอบ" target for assessment items. */
  assessmentHref: string | null;
  /** Custom items can be edited/deleted in place. */
  editable: boolean;
}

/** Fields the server sends back after a mutation so the client can reconcile. */
export type SessionPatch = Partial<
  Pick<
    StudySessionVM,
    | "status"
    | "rawStatus"
    | "actualMinutes"
    | "progressPercent"
    | "notes"
    | "history"
    | "completedAt"
    | "deferredAt"
  >
>;
