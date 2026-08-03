import { z } from "zod";

/** YYYY-MM-DD */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ต้องเป็นวันที่รูปแบบ YYYY-MM-DD");

/** HH:MM 24h */
export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "ต้องเป็นเวลารูปแบบ HH:MM");

export const activityTypeEnum = z.enum([
  "course",
  "review",
  "diagnostic",
  "quiz",
  "exercise",
  "mock",
  "rest",
  "other",
]);
export type ActivityType = z.infer<typeof activityTypeEnum>;

export const priorityEnum = z.enum(["high", "medium", "low"]);
export type PriorityType = z.infer<typeof priorityEnum>;

export const assessmentTypeEnum = z.enum([
  "diagnostic",
  "quiz",
  "exercise",
  "mock",
]);
export type AssessmentType = z.infer<typeof assessmentTypeEnum>;

export const sourceTypeEnum = z.enum([
  "uploaded_file",
  "course_document",
  "external",
  "generated_prompt",
]);

export const generatedByEnum = z.enum([
  "chatgpt",
  "claude_recovery",
  "manual_import",
]);

export const planItemStatusEnum = z.enum([
  "not_started", // ยังไม่เริ่ม
  "studying", // กำลังเรียน
  "paused", // พัก
  "completed", // เรียนเสร็จ
  "incomplete", // ทำไม่ครบ
  "needs_review", // ต้องทบทวน
  "recovery", // Recovery
  "cancelled", // ยกเลิกตามแผนใหม่
]);
export type PlanItemStatus = z.infer<typeof planItemStatusEnum>;

export const reviewRuleEnum = z.enum([
  "same_day",
  "next_day",
  "three_days",
  "seven_days",
  "weekly",
  "monthly",
]);
export type ReviewRule = z.infer<typeof reviewRuleEnum>;

export const errorTypeEnum = z.enum([
  "concept_misunderstanding",
  "formula_memory",
  "reading_error",
  "calculation_error",
  "wrong_method",
  "guessed",
  "too_slow",
  "careless",
  "not_learned",
  "out_of_scope_question",
]);
export type ErrorType = z.infer<typeof errorTypeEnum>;

export const pageRange = z.object({
  from: z.number().int().positive().nullable().optional(),
  to: z.number().int().positive().nullable().optional(),
});
