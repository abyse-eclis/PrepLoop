import { z } from "zod";
import {
  activityTypeEnum,
  dateString,
  generatedByEnum,
  priorityEnum,
} from "./common";
import {
  pickPrimaryCourseResource,
  pickPrimaryResource,
  studyResourceSchema,
} from "./study-resource";

const resourceUrlSchema = z
  .string()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    {
      message: "resourceUrl ต้องขึ้นต้นด้วย http:// หรือ https://",
    }
  );

export const planItemSchema = z
  .object({
    stableExternalId: z.string().min(1),
    subject: z.string().min(1),
    /** What is being studied. Optional: legacy plans fall back to instructions. */
    topic: z.string().trim().min(1).nullable().optional(),
    courseCode: z.string().nullable().optional(),
    lessonFrom: z.string().nullable().optional(),
    lessonTo: z.string().nullable().optional(),
    activityType: activityTypeEnum,
    assessmentSourceId: z.string().nullable().optional(),
    targetMinutes: z.number().int().min(0),
    priority: priorityEnum.default("medium"),
    instructions: z.string().optional().default(""),
    resourceUrl: resourceUrlSchema.optional(),
    resourceLabel: z.string().optional(),
    /** Hybrid paid/free learning resources. Absent on legacy plans. */
    resources: z.array(studyResourceSchema).optional(),
    reviewReferenceIds: z.array(z.string()).optional().default([]),
    metadata: z.record(z.string(), z.any()).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .transform((item) => {
    const fallbackResourceUrl =
      typeof item.metadata?.videoUrl === "string" &&
      (item.metadata.videoUrl.startsWith("http://") ||
        item.metadata.videoUrl.startsWith("https://"))
        ? item.metadata.videoUrl
        : typeof item.metadata?.resourceUrl === "string" &&
            (item.metadata.resourceUrl.startsWith("http://") ||
              item.metadata.resourceUrl.startsWith("https://"))
          ? item.metadata.resourceUrl
          : undefined;

    // Keep the legacy columns meaningful for plans written in the new format,
    // so exports, the plan diff and course progress keep reading them.
    const resources = item.resources ?? [];
    const primary = pickPrimaryResource(resources);
    const primaryCourse = pickPrimaryCourseResource(resources);
    const courseCode = item.courseCode ?? primaryCourse?.courseCode ?? undefined;
    const lessonFrom = item.lessonFrom ?? primaryCourse?.lessonFrom ?? undefined;
    const lessonTo = item.lessonTo ?? primaryCourse?.lessonTo ?? undefined;

    const withLegacyFields = {
      ...item,
      ...(courseCode !== undefined ? { courseCode } : {}),
      ...(lessonFrom !== undefined ? { lessonFrom } : {}),
      ...(lessonTo !== undefined ? { lessonTo } : {}),
    };

    const resourceUrl =
      item.resourceUrl ?? fallbackResourceUrl ?? primary?.url ?? undefined;
    if (!resourceUrl) return withLegacyFields;
    return {
      ...withLegacyFields,
      resourceUrl,
      resourceLabel:
        item.resourceLabel ??
        (primary?.url === resourceUrl
          ? (primary.provider ?? primary.title)
          : undefined) ??
        "เปิดลิงก์",
    };
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
