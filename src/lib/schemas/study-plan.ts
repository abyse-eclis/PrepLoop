import { z } from "zod";
import {
  activityTypeEnum,
  dateString,
  generatedByEnum,
  priorityEnum,
} from "./common";

export const planItemSchema = z.object({
  stableExternalId: z.string().min(1),
  subject: z.string().min(1),
  courseCode: z.string().nullable().optional(),
  lessonFrom: z.string().nullable().optional(),
  lessonTo: z.string().nullable().optional(),
  activityType: activityTypeEnum,
  assessmentSourceId: z.string().nullable().optional(),
  targetMinutes: z.number().int().min(0),
  priority: priorityEnum.default("medium"),
  instructions: z.string().optional().default(""),
  reviewReferenceIds: z.array(z.string()).optional().default([]),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const planDaySchema = z.object({
  date: dateString,
  targetMinutes: z.number().int().min(0),
  napTargetMinutes: z.number().int().min(0).optional().default(0),
  notes: z.string().optional().default(""),
  items: z.array(planItemSchema).default([]),
});

export const studyPlanSchema = z
  .object({
    schemaVersion: z.string(),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    startDate: dateString,
    endDate: dateString,
    parentPlanVersionId: z.string().nullable().optional(),
    changeReason: z.string().nullable().optional(),
    generatedBy: generatedByEnum.default("chatgpt"),
    days: z.array(planDaySchema).min(1, "แผนต้องมีอย่างน้อยหนึ่งวัน"),
  })
  .refine((p) => p.endDate >= p.startDate, {
    message: "endDate ต้องไม่มาก่อน startDate",
    path: ["endDate"],
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const day of p.days) {
      for (const item of day.items) {
        if (ids.has(item.stableExternalId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `stableExternalId ซ้ำกัน: ${item.stableExternalId}`,
            path: ["days"],
          });
        }
        ids.add(item.stableExternalId);
      }
    }
  });

export type StudyPlan = z.infer<typeof studyPlanSchema>;
export type PlanItemInput = z.infer<typeof planItemSchema>;
export type PlanDayInput = z.infer<typeof planDaySchema>;
