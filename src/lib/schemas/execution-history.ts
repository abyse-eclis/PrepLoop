import { z } from "zod";
import { dateString, timeString } from "./common";

/**
 * "execution_history_reference" is a REFERENCE format (schemaVersion like
 * "1.0-reference"): a list of what was actually studied, to backfill history.
 * Fields are kept permissive (unknown keys pass through) because the reference
 * format may carry extra metadata — only the fields we map are validated.
 */
const historySession = z
  .object({
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    durationMinutes: z.number().int().min(0).optional(),
    status: z.string().optional(),
    note: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const executionHistoryRecordSchema = z
  .object({
    date: dateString,
    subject: z.string().optional(),
    courseCode: z.string().optional(),
    lessonCode: z.string().optional(),
    lessonFrom: z.string().optional(),
    lessonTo: z.string().optional(),
    activityType: z.string().optional(),
    taskRef: z.string().optional(),
    sourceActivityId: z.string().optional(),
    stableExternalId: z.string().optional(),
    planItemExternalId: z.string().optional(),
    assessmentSourceId: z.string().optional(),
    score: z.number().optional(),
    maxScore: z.number().optional(),
    correct: z.number().int().min(0).optional(),
    incorrect: z.number().int().min(0).optional(),
    totalQuestions: z.number().int().min(0).optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
    note: z.string().optional(),
    progress: z.unknown().optional(),
    // Flat single-session shape:
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    durationMinutes: z.number().int().min(0).optional(),
    // Or multiple sessions per record:
    sessions: z.array(historySession).optional(),
  })
  .passthrough();

export const executionHistorySchema = z.object({
  schemaVersion: z.string(),
  type: z.literal("execution_history_reference"),
  timezone: z.string().optional().default("Asia/Bangkok"),
  records: z.array(executionHistoryRecordSchema).min(1, "ต้องมีอย่างน้อยหนึ่ง record"),
});

export type ExecutionHistory = z.infer<typeof executionHistorySchema>;
export type ExecutionHistoryRecord = z.infer<typeof executionHistoryRecordSchema>;
