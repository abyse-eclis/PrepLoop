/**
 * Turn a StudyExport into a downloadable file.
 *
 * CSV is one sheet per subject area — a spreadsheet cannot hold the nested
 * shape — while JSON carries the whole record, including the meta block and
 * totals, for re-import or for pasting into a prompt.
 */

import { toCsvFile } from "@/lib/export/csv";
import { EXPORT_RANGE_LABELS } from "@/lib/export/range";
import type { StudyExport } from "@/lib/export/types";

export const EXPORT_FORMATS = [
  "csv-daily",
  "csv-sessions",
  "csv-items",
  "csv-assessments",
  "json",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  "csv-daily": "CSV · สรุปรายวัน",
  "csv-sessions": "CSV · บันทึกการเรียน (รายช่วงเวลา)",
  "csv-items": "CSV · รายการตามแผน + สถานะ",
  "csv-assessments": "CSV · ผลสอบ",
  json: "JSON · ทั้งหมดในไฟล์เดียว",
};

export const EXPORT_FORMAT_HINTS: Record<ExportFormat, string> = {
  "csv-daily": "หนึ่งแถวต่อหนึ่งวัน: เป้าหมาย เวลาจริง Time% Task% Weighted%",
  "csv-sessions": "หนึ่งแถวต่อหนึ่งช่วงเวลาที่เรียนจริง พร้อมธงเรียนย้อนหลัง",
  "csv-items": "หนึ่งแถวต่อหนึ่งรายการในแผน พร้อมสถานะและเวลาที่ทำจริง",
  "csv-assessments": "หนึ่งแถวต่อหนึ่งครั้งที่ทำข้อสอบ พร้อมคะแนนและผลผ่าน",
  json: "โครงสร้างครบ (meta + totals + วัน + session + แผน + ผลสอบ)",
};

export function isExportFormat(value: unknown): value is ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat);
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string;
}

const FILE_SLUG: Record<ExportFormat, string> = {
  "csv-daily": "daily",
  "csv-sessions": "sessions",
  "csv-items": "plan-items",
  "csv-assessments": "assessments",
  json: "full",
};

/** ASCII-only filename — non-Latin names travel badly in Content-Disposition. */
export function exportFilename(
  format: ExportFormat,
  start: string,
  end: string
): string {
  const ext = format === "json" ? "json" : "csv";
  const span = start === end ? start : `${start}_${end}`;
  return `preploop-${FILE_SLUG[format]}-${span}.${ext}`;
}

function dailyCsv(data: StudyExport): string {
  return toCsvFile(
    [
      "date",
      "week",
      "month",
      "target_minutes",
      "actual_minutes",
      "time_percent",
      "task_percent",
      "weighted_percent",
      "total_items",
      "completed_items",
      "pending_items",
      "excluded_items",
      "session_count",
      "assessment_count",
    ],
    data.days.map((d) => [
      d.date,
      d.weekKey,
      d.monthKey,
      d.targetMinutes,
      d.actualMinutes,
      d.timePercent,
      d.taskPercent,
      d.weightedPercent,
      d.totalItems,
      d.completedItems,
      d.pendingItems,
      d.excludedItems,
      d.sessionCount,
      d.assessmentCount,
    ])
  );
}

function sessionsCsv(data: StudyExport): string {
  return toCsvFile(
    [
      "date",
      "week",
      "month",
      "subject",
      "course_code",
      "activity_type",
      "lesson_from",
      "lesson_to",
      "start_time",
      "end_time",
      "duration_minutes",
      "status",
      "planned_date",
      "caught_up",
      "note",
      "session_id",
    ],
    data.sessions.map((s) => [
      s.date,
      s.weekKey,
      s.monthKey,
      s.subject,
      s.courseCode,
      s.activityType,
      s.lessonFrom,
      s.lessonTo,
      s.startTime,
      s.endTime,
      s.durationMinutes,
      s.status,
      s.plannedDate,
      s.caughtUp,
      s.note,
      s.id,
    ])
  );
}

function itemsCsv(data: StudyExport): string {
  return toCsvFile(
    [
      "planned_date",
      "week",
      "month",
      "plan_version",
      "plan_version_number",
      "subject",
      "course_code",
      "activity_type",
      "lesson_from",
      "lesson_to",
      "priority",
      "target_minutes",
      "actual_minutes",
      "status",
      "execution_state",
      "instructions",
      "stable_external_id",
      "resource_url",
      "resource_label",
    ],
    data.planItems.map((i) => [
      i.plannedDate,
      i.weekKey,
      i.monthKey,
      i.planVersion,
      i.planVersionNumber,
      i.subject,
      i.courseCode,
      i.activityType,
      i.lessonFrom,
      i.lessonTo,
      i.priority,
      i.targetMinutes,
      i.actualMinutes,
      i.status,
      i.executionState,
      i.instructions,
      i.stableExternalId,
      i.resourceUrl ?? "",
      i.resourceLabel ?? "",
    ])
  );
}

function assessmentsCsv(data: StudyExport): string {
  return toCsvFile(
    [
      "date",
      "week",
      "month",
      "subject",
      "score",
      "max_score",
      "percentage",
      "passing_percentage",
      "passed",
      "total_questions",
      "correct",
      "incorrect",
      "skipped",
      "guessed",
      "duration_minutes",
      "notes",
    ],
    data.assessments.map((a) => [
      a.date,
      a.weekKey,
      a.monthKey,
      a.subject,
      a.score,
      a.maxScore,
      a.percentage,
      a.passingPercentage,
      a.passed,
      a.totalQuestions,
      a.correct,
      a.incorrect,
      a.skipped,
      a.guessed,
      a.durationMinutes,
      a.notes,
    ])
  );
}

const CSV_RENDERERS: Record<
  Exclude<ExportFormat, "json">,
  (data: StudyExport) => string
> = {
  "csv-daily": dailyCsv,
  "csv-sessions": sessionsCsv,
  "csv-items": itemsCsv,
  "csv-assessments": assessmentsCsv,
};

export function renderExport(
  data: StudyExport,
  format: ExportFormat
): ExportFile {
  const filename = exportFilename(format, data.meta.start, data.meta.end);

  if (format === "json") {
    return {
      filename,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(data, null, 2),
    };
  }

  return {
    filename,
    contentType: "text/csv; charset=utf-8",
    body: CSV_RENDERERS[format](data),
  };
}

/** Short human summary of what a file contains, for the UI and for logs. */
export function describeExport(data: StudyExport, format: ExportFormat): string {
  const rangeLabel =
    EXPORT_RANGE_LABELS[data.meta.rangeKind as keyof typeof EXPORT_RANGE_LABELS] ??
    data.meta.rangeKind;
  const counts: Record<ExportFormat, number> = {
    "csv-daily": data.days.length,
    "csv-sessions": data.sessions.length,
    "csv-items": data.planItems.length,
    "csv-assessments": data.assessments.length,
    json:
      data.days.length +
      data.sessions.length +
      data.planItems.length +
      data.assessments.length,
  };
  return `${rangeLabel} · ${data.meta.start} → ${data.meta.end} · ${counts[format]} แถว`;
}
