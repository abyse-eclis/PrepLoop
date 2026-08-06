import { z } from "zod";
import { assessmentTypeEnum, pageRange, sourceTypeEnum } from "./common";

export const lessonSchema = z.object({
  id: z.string().min(1),
  lessonNumber: z.string().min(1), // may be "003.1"
  title: z.string().min(1),
  section: z.string().optional(),
  order: z.number().optional(),
  prerequisiteLessonIds: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  lessonUrl: z.string().url().optional(),
  sourceType: z.string().optional(),
});

export const courseSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().optional(),
});

export const courseSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1), // e.g. K001
  name: z.string().min(1),
  subject: z.string().min(1),
  totalLessons: z.number().int().min(0).optional(),
  sections: z.array(courseSectionSchema).optional().default([]),
  lessons: z.array(lessonSchema).default([]),
  documents: z.array(z.string()).optional().default([]),
});

export const sourceFileSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  fileType: z.string().min(1),
  storagePath: z.string().nullable().optional(),
  uploadRequired: z.boolean().optional().default(true),
});

export const assessmentSourceSchema = z.object({
  id: z.string().min(1),
  type: assessmentTypeEnum,
  subject: z.string().min(1),
  title: z.string().min(1),
  courseCode: z.string().nullable().optional(),
  lessonFrom: z.string().nullable().optional(),
  lessonTo: z.string().nullable().optional(),
  sourceType: sourceTypeEnum,
  sourceFileId: z.string().nullable().optional(),
  storageFileId: z.string().nullable().optional(),
  questionPages: pageRange.optional(),
  answerPages: pageRange.optional(),
  solutionPages: pageRange.optional(),
  coveredTopics: z.array(z.string()).optional().default([]),
  requiredCompletedLessons: z.array(z.string()).optional().default([]),
  passingPercentage: z.number().min(0).max(100).default(70),
  requiresManualVerification: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

export const learningSourceCatalogSchema = z.object({
  schemaVersion: z.string(),
  catalogName: z.string().min(1),
  subjects: z.array(z.string()).optional().default([]),
  courses: z.array(courseSchema).default([]),
  sourceFiles: z.array(sourceFileSchema).optional().default([]),
  assessmentSources: z.array(assessmentSourceSchema).optional().default([]),
});

export type LearningSourceCatalog = z.infer<typeof learningSourceCatalogSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type AssessmentSourceInput = z.infer<typeof assessmentSourceSchema>;
