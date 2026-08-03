import { z } from "zod";
import { dateString } from "./common";
import { planDaySchema } from "./study-plan";

export const recoveryEvidenceSchema = z.object({
  type: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  threshold: z.union([z.number(), z.string()]).optional(),
  detail: z.string().optional(),
});

export const recoveryChangeSchema = z.object({
  action: z.enum(["postpone", "reduce", "remove", "add", "merge", "keep"]),
  sourceItemExternalId: z.string().optional(),
  reason: z.string().min(1),
});

export const recoveryPlanSchema = z.object({
  schemaVersion: z.string(),
  parentPlanVersionId: z.string().min(1),
  effectiveFrom: dateString,
  generatedBy: z.literal("claude_recovery").default("claude_recovery"),
  reason: z.string().min(1),
  evidence: z.array(recoveryEvidenceSchema).default([]),
  weakSubjects: z.array(z.string()).default([]),
  weakTopics: z.array(z.string()).default([]),
  changes: z.array(recoveryChangeSchema).default([]),
  days: z.array(planDaySchema).default([]),
  addedReviews: z.array(z.string()).optional().default([]),
  postponedItems: z.array(z.string()).optional().default([]),
  reducedItems: z.array(z.string()).optional().default([]),
  removedLowPriorityItems: z.array(z.string()).optional().default([]),
  riskNotes: z.array(z.string()).optional().default([]),
});

export type RecoveryPlan = z.infer<typeof recoveryPlanSchema>;
