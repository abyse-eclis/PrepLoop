import { z } from "zod";
import { dateString } from "./common";

/**
 * Import schema for a hybrid learning resource.
 *
 * `title`, `tier` and `type` are required; everything else is optional so a
 * hand-written plan can carry as little as a name and which column it belongs
 * in. Enums accept any casing — plans are written by hand and by ChatGPT.
 */

const upperCased = (schema: z.ZodTypeAny) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    schema
  );

export const resourceTierEnum = z.enum(["PAID", "FREE"]);
export const resourceTypeEnum = z.enum([
  "COURSE",
  "YOUTUBE",
  "DOCUMENT",
  "WEBSITE",
  "PRACTICE",
  "MOCK",
]);
export const resourceStatusEnum = z.enum([
  "NOT_STARTED",
  "LISTENED",
  "IN_PROGRESS",
  "COMPLETED",
  "REVIEW_REQUIRED",
]);
export const resourceAccessTypeEnum = z.enum([
  "EXPIRING",
  "LIMITED_HOURS",
  "FREE",
  "PERMANENT",
]);

const resourceUrl = z
  .string()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    { message: "url ของแหล่งเรียนต้องขึ้นต้นด้วย http:// หรือ https://" }
  );

const optionalText = z.string().trim().min(1).nullable().optional();

export const studyResourceSchema = z.object({
  id: z.string().optional(),
  tier: upperCased(resourceTierEnum),
  type: upperCased(resourceTypeEnum),
  provider: optionalText,
  title: z.string().trim().min(1, "แหล่งเรียนต้องมีชื่อ (title)"),
  url: resourceUrl.nullable().optional(),
  courseCode: optionalText,
  lessonFrom: optionalText,
  lessonTo: optionalText,
  durationMinutes: z.number().int().min(0).nullable().optional(),
  status: upperCased(resourceStatusEnum).default("NOT_STARTED"),
  accessType: upperCased(resourceAccessTypeEnum).nullable().optional(),
  expiresAt: dateString.nullable().optional(),
  limitedWatchTime: z.boolean().optional().default(false),
  listenMode: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type StudyResourceInput = z.infer<typeof studyResourceSchema>;

/**
 * The resource an item's legacy `resource_url` / `course_code` columns should
 * mirror, so old readers (exports, plan diff, /courses progress, repair) keep
 * seeing a plan written in the new format.
 */
export function pickPrimaryResource(
  resources: StudyResourceInput[]
): StudyResourceInput | null {
  if (resources.length === 0) return null;
  const paidWithUrl = resources.find((r) => r.tier === "PAID" && r.url);
  if (paidWithUrl) return paidWithUrl;
  const anyWithUrl = resources.find((r) => r.url);
  if (anyWithUrl) return anyWithUrl;
  return resources.find((r) => r.tier === "PAID") ?? resources[0] ?? null;
}

export function pickPrimaryCourseResource(
  resources: StudyResourceInput[]
): StudyResourceInput | null {
  return (
    resources.find(
      (r) => r.tier === "PAID" && r.type === "COURSE" && r.courseCode
    ) ??
    resources.find((r) => r.courseCode) ??
    null
  );
}
