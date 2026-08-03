import { z } from "zod";
import { dateString, timeString } from "./common";

export const examEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  examType: z.string().min(1),
  subject: z.string().optional(),
  date: dateString,
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  sourceUrl: z.string().url().optional(),
  verifiedAt: z.string().optional(),
});

export const scoreTargetSchema = z.object({
  examType: z.string().min(1),
  subject: z.string().optional(),
  targetScore: z.number().optional(),
  targetPercentage: z.number().min(0).max(100).optional(),
});

export const workspaceConfigSchema = z.object({
  schemaVersion: z.string(),
  workspace: z.object({
    name: z.string().min(1),
    timezone: z.string().min(1).default("Asia/Bangkok"),
    startDate: dateString,
    dailyTargetMinutes: z.number().int().positive(),
    napTargetMinutes: z
      .object({
        min: z.number().int().min(0),
        max: z.number().int().min(0),
      })
      .refine((v) => v.max >= v.min, {
        message: "napTargetMinutes.max ต้องไม่น้อยกว่า min",
      }),
  }),
  studyConstraints: z.record(z.string(), z.any()).optional().default({}),
  successRules: z
    .object({
      timeCompletionTargetPercent: z.number().min(0).max(100).default(80),
      taskCompletionTargetPercent: z.number().min(0).max(100).default(80),
      defaultPassingPercent: z.number().min(0).max(100).default(70),
    })
    .default({
      timeCompletionTargetPercent: 80,
      taskCompletionTargetPercent: 80,
      defaultPassingPercent: 70,
    }),
  recoveryRules: z
    .object({
      dailyCompletionTriggerPercent: z.number().min(0).max(100).default(70),
      maximumDailyMinutes: z.number().int().positive().default(480),
      overdueReviewTriggerCount: z.number().int().min(0).default(5),
      failedAssessmentTrigger: z.boolean().default(true),
    })
    .default({
      dailyCompletionTriggerPercent: 70,
      maximumDailyMinutes: 480,
      overdueReviewTriggerCount: 5,
      failedAssessmentTrigger: true,
    }),
  examEvents: z.array(examEventSchema).default([]),
  scoreTargets: z.array(scoreTargetSchema).optional().default([]),
});

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
