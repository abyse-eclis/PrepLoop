import type {
  ExecutionHistory,
  ExecutionHistoryRecord,
} from "@/lib/schemas/execution-history";
import { validateIntervals } from "@/lib/dates";

export interface NormalizedSession {
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  crossesMidnight: boolean;
  subject: string | null;
  sourceActivityId: string | null;
  assessmentSourceId: string | null;
  activityType: string | null;
  courseCode: string | null;
  lessonFrom: string | null;
  lessonTo: string | null;
  planItemExternalId: string | null;
  status: string;
  note: string | null;
  score: number | null;
  maxScore: number | null;
  correct: number | null;
  incorrect: number | null;
  totalQuestions: number | null;
  /** Stable within-file key for dedup. */
  dedupKey: string;
}

export interface HistoryRecordIssue {
  recordIndex: number;
  date: string | null;
  field: string;
  reason: string;
  expected: string;
}

export interface NormalizedHistory {
  sessions: NormalizedSession[];
  issues: HistoryRecordIssue[];
  totalMinutes: number;
  dayCount: number;
  duplicatesInFile: number;
}

const VALID_SESSION_STATUS = new Set([
  "studying",
  "paused",
  "completed",
  "interrupted",
]);

function normalizeStatus(raw: string | undefined): string {
  if (!raw) return "completed";
  const s = raw.toLowerCase();
  if (VALID_SESSION_STATUS.has(s)) return s;
  if (s === "done" || s === "finished") return "completed";
  return "completed";
}

interface RawSession {
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  status?: string;
  note?: string;
  notes?: string;
}

function collectSessions(record: ExecutionHistoryRecord): RawSession[] {
  if (record.sessions && record.sessions.length > 0) return record.sessions;
  if (record.startTime || record.endTime || record.durationMinutes != null) {
    return [
      {
        startTime: record.startTime,
        endTime: record.endTime,
        durationMinutes: record.durationMinutes,
        status: record.status,
        note: record.notes ?? record.note,
      },
    ];
  }
  return [];
}

/**
 * Convert reference execution-history records into domain study-session rows.
 * Pure: computes duration (with cross-midnight support), reports per-record
 * issues, and dedupes identical sessions within the file.
 */
export function normalizeExecutionHistory(
  history: ExecutionHistory
): NormalizedHistory {
  const sessions: NormalizedSession[] = [];
  const issues: HistoryRecordIssue[] = [];
  const days = new Set<string>();
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  history.records.forEach((record, recordIndex) => {
    const raws = collectSessions(record);
    if (raws.length === 0) {
      issues.push({
        recordIndex,
        date: record.date,
        field: "startTime/endTime/durationMinutes",
        reason: "ไม่มีข้อมูลเวลาเรียนใน record นี้",
        expected: "startTime+endTime (HH:mm) หรือ durationMinutes",
      });
      return;
    }

    for (const raw of raws) {
      let durationMinutes: number;
      let crossesMidnight = false;

      if (raw.startTime && raw.endTime) {
        const v = validateIntervals([{ start: raw.startTime, end: raw.endTime }]);
        if (!v.ok) {
          issues.push({
            recordIndex,
            date: record.date,
            field: "startTime/endTime",
            reason: v.errors.join("; "),
            expected: "endTime ต้องอยู่หลัง startTime (หรือช่วงข้ามคืน ≤ 16 ชม.)",
          });
          continue;
        }
        durationMinutes = v.totalMinutes;
        crossesMidnight = v.details[0]?.crossesMidnight ?? false;
      } else if (typeof raw.durationMinutes === "number") {
        durationMinutes = raw.durationMinutes;
      } else {
        issues.push({
          recordIndex,
          date: record.date,
          field: "startTime/endTime/durationMinutes",
          reason: "ระบุเวลาไม่ครบ",
          expected: "ต้องมี startTime+endTime หรือ durationMinutes",
        });
        continue;
      }

      const subject = record.subject ?? null;
      const sourceActivityId =
        record.sourceActivityId ??
        record.planItemExternalId ??
        record.stableExternalId ??
        record.taskRef ??
        null;
      const assessmentSourceId = record.assessmentSourceId ?? null;
      const start = raw.startTime ?? null;
      const end = raw.endTime ?? null;
      const dedupKey = `${record.date}|${start ?? ""}|${end ?? ""}|${sourceActivityId ?? ""}|${assessmentSourceId ?? ""}|${subject ?? ""}|${record.activityType ?? ""}|${durationMinutes}`;
      if (seen.has(dedupKey)) {
        duplicatesInFile++;
        continue;
      }
      seen.add(dedupKey);
      days.add(record.date);

      sessions.push({
        sessionDate: record.date,
        startTime: start,
        endTime: end,
        durationMinutes,
        crossesMidnight,
        subject,
        sourceActivityId,
        assessmentSourceId,
        activityType: record.activityType ?? null,
        courseCode: record.courseCode ?? null,
        lessonFrom: record.lessonFrom ?? record.lessonCode ?? null,
        lessonTo: record.lessonTo ?? record.lessonCode ?? null,
        planItemExternalId: sourceActivityId,
        status: normalizeStatus(raw.status ?? record.status),
        note: raw.note ?? raw.notes ?? record.notes ?? record.note ?? null,
        score: record.score ?? null,
        maxScore: record.maxScore ?? null,
        correct: record.correct ?? null,
        incorrect: record.incorrect ?? null,
        totalQuestions: record.totalQuestions ?? null,
        dedupKey,
      });
    }
  });

  return {
    sessions,
    issues,
    totalMinutes: sessions.reduce((s, x) => s + x.durationMinutes, 0),
    dayCount: days.size,
    duplicatesInFile,
  };
}
