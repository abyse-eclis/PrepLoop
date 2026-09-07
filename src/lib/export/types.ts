/**
 * Shapes of an exported study record.
 *
 * These live in lib (not the feature) so the pure formatters and their tests
 * never reach into server-only code.
 */

export interface ExportSessionRow {
  id: string;
  date: string;
  weekKey: string;
  monthKey: string;
  subject: string | null;
  courseCode: string | null;
  activityType: string | null;
  lessonFrom: string | null;
  lessonTo: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  status: string;
  note: string | null;
  planItemId: string | null;
  /** planned date of the linked plan item — differs on catch-up study. */
  plannedDate: string | null;
  /** true when the session was logged on a day after the planned date. */
  caughtUp: boolean;
}

export interface ExportPlanItemRow {
  id: string;
  plannedDate: string;
  weekKey: string;
  monthKey: string;
  planVersion: string | null;
  planVersionNumber: number | null;
  stableExternalId: string;
  subject: string;
  /** Learning topic; falls back to instructions on legacy items. */
  topic: string;
  courseCode: string | null;
  activityType: string;
  lessonFrom: string | null;
  lessonTo: string | null;
  priority: string;
  targetMinutes: number;
  actualMinutes: number;
  status: string;
  executionState: string;
  instructions: string | null;
  resourceUrl?: string | null;
  resourceLabel?: string | null;
  /** Paid/free resources, counted per tier — never merged into one number. */
  paidResources?: number;
  freeResources?: number;
  paidResourcesCompleted?: number;
  freeResourcesCompleted?: number;
  resources?: ExportResourceRow[];
  assessmentSourceId?: string | null;
  reviewReferenceIds?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface ExportResourceRow {
  id: string;
  tier: string;
  type: string;
  provider: string | null;
  title: string;
  url: string | null;
  courseCode: string | null;
  lessonFrom: string | null;
  lessonTo: string | null;
  durationMinutes: number | null;
  status: string;
  accessType: string | null;
  expiresAt: string | null;
  limitedWatchTime: boolean;
  listenMode: boolean;
  /** true while the resource is still only described by legacy item columns. */
  legacy: boolean;
}

export interface ExportDayRow {
  date: string;
  weekKey: string;
  monthKey: string;
  targetMinutes: number;
  actualMinutes: number;
  timePercent: number;
  taskPercent: number;
  weightedPercent: number;
  totalItems: number;
  completedItems: number;
  pendingItems: number;
  excludedItems: number;
  sessionCount: number;
  assessmentCount: number;
}

export interface ExportAssessmentRow {
  id: string;
  date: string;
  weekKey: string;
  monthKey: string;
  subject: string | null;
  score: number;
  maxScore: number;
  percentage: number | null;
  passingPercentage: number;
  passed: boolean | null;
  totalQuestions: number | null;
  correct: number | null;
  incorrect: number | null;
  skipped: number | null;
  guessed: number | null;
  durationMinutes: number | null;
  notes: string | null;
}

export interface ExportTotals {
  days: number;
  studiedDays: number;
  targetMinutes: number;
  actualMinutes: number;
  timePercent: number;
  sessionCount: number;
  planItems: number;
  completedItems: number;
  skippedItems: number;
  assessmentCount: number;
  minutesBySubject: Array<{ subject: string; minutes: number }>;
}

export interface StudyExport {
  meta: {
    app: "PrepLoop";
    generatedAt: string;
    workspaceName: string;
    timezone: string;
    rangeKind: string;
    rangeLabel: string;
    start: string;
    end: string;
  };
  totals: ExportTotals;
  days: ExportDayRow[];
  sessions: ExportSessionRow[];
  planItems: ExportPlanItemRow[];
  assessments: ExportAssessmentRow[];
}
