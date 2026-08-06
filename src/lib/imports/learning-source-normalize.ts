import type { LearningSourceCatalog } from "@/lib/schemas/learning-source";

/**
 * Deduplicates a Learning Source Catalog against the REAL database conflict
 * keys before any upsert, so a single upsert statement never contains two rows
 * with the same conflict key (which causes Postgres error 21000:
 * "ON CONFLICT DO UPDATE command cannot affect row a second time").
 *
 * Dedup keys mirror the migration constraints exactly:
 *   subjects            -> (workspace_id, code)          => code
 *   courses             -> (workspace_id, code)          => code
 *   course_lessons      -> (course_id, external_id)      => courseExternalId + external_id
 *   source_files        -> (workspace_id, external_id)   => external_id (added in 0004)
 *   assessment_sources  -> (workspace_id, external_id)   => external_id
 *
 * Merge rule: last occurrence wins (later entries override earlier ones), which
 * keeps import idempotent and predictable. Every removed duplicate is reported.
 */

export interface DedupReport {
  entity: string;
  conflictKey: string;
  incoming: number;
  unique: number;
  duplicatesRemoved: number;
  /** Sample of duplicate keys (capped) for readable reporting. */
  duplicateKeys: string[];
}

export interface NormalizedSubject {
  code: string;
  name: string | null;
}

export interface NormalizedCourse {
  externalId: string;
  code: string;
  name: string;
  subject: string;
  totalLessons: number | null;
}

export interface NormalizedLesson {
  courseExternalId: string;
  externalId: string;
  lessonNumber: string;
  title: string;
  section: string | null;
  orderIndex: number | null;
  prerequisiteLessonIds: string[];
  lessonUrl: string | null;
  sourceType: string | null;
}

export interface NormalizedSourceFile {
  externalId: string;
  title: string;
  fileType: string;
  storagePath: string | null;
}

export interface NormalizedAssessment {
  externalId: string;
  type: string;
  subject: string;
  title: string;
  courseCode: string | null;
  lessonFrom: string | null;
  lessonTo: string | null;
  sourceType: string;
  sourceFileExternalId: string | null;
  questionPageFrom: number | null;
  questionPageTo: number | null;
  answerPageFrom: number | null;
  answerPageTo: number | null;
  solutionPageFrom: number | null;
  solutionPageTo: number | null;
  coveredTopics: string[];
  requiredCompletedLessons: string[];
  passingPercentage: number;
  notes: string | null;
}

export interface NormalizedCatalog {
  subjects: NormalizedSubject[];
  courses: NormalizedCourse[];
  lessons: NormalizedLesson[];
  sourceFiles: NormalizedSourceFile[];
  assessments: NormalizedAssessment[];
  /** Lessons dropped because their course had no resolvable code/id. */
  skippedLessons: number;
  reports: DedupReport[];
}

const SAMPLE_CAP = 10;

/**
 * Deduplicate an array by a composite key, last-wins, and produce a report.
 */
function dedupeBy<T>(
  entity: string,
  conflictKey: string,
  rows: T[],
  keyOf: (row: T) => string
): { unique: T[]; report: DedupReport } {
  const map = new Map<string, T>();
  const seenTwice = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (map.has(key)) {
      seenTwice.set(key, (seenTwice.get(key) ?? 1) + 1);
    }
    map.set(key, row); // last wins
  }
  const unique = Array.from(map.values());
  return {
    unique,
    report: {
      entity,
      conflictKey,
      incoming: rows.length,
      unique: unique.length,
      duplicatesRemoved: rows.length - unique.length,
      duplicateKeys: Array.from(seenTwice.keys()).slice(0, SAMPLE_CAP),
    },
  };
}

export function normalizeLearningSource(
  catalog: LearningSourceCatalog
): NormalizedCatalog {
  const reports: DedupReport[] = [];

  // --- Subjects: from explicit list + every course.subject ---
  const rawSubjects: NormalizedSubject[] = [];
  for (const s of catalog.subjects ?? []) {
    if (s) rawSubjects.push({ code: s, name: s });
  }
  for (const c of catalog.courses ?? []) {
    if (c.subject) rawSubjects.push({ code: c.subject, name: c.subject });
  }
  const subjects = dedupeBy(
    "subjects",
    "(workspace_id, code)",
    rawSubjects,
    (s) => s.code
  );
  reports.push(subjects.report);

  // --- Courses: conflict on code ---
  const rawCourses: NormalizedCourse[] = (catalog.courses ?? []).map((c) => ({
    externalId: c.id,
    code: c.code,
    name: c.name,
    subject: c.subject,
    totalLessons: c.totalLessons ?? c.lessons.length,
  }));
  const courses = dedupeBy(
    "courses",
    "(workspace_id, code)",
    rawCourses,
    (c) => c.code
  );
  reports.push(courses.report);

  // Map every course external id -> canonical (deduped) course code, so lessons
  // attach to the surviving course row.
  const courseCodeByExternalId = new Map<string, string>();
  for (const c of catalog.courses ?? []) {
    courseCodeByExternalId.set(c.id, c.code);
  }

  // --- Lessons: conflict on (course_id, external_id). We dedupe on
  // (courseCode, lessonExternalId) since course_id is resolved from code. ---
  const rawLessons: NormalizedLesson[] = [];
  let skippedLessons = 0;
  for (const course of catalog.courses ?? []) {
    for (const l of course.lessons ?? []) {
      if (!course.code) {
        skippedLessons++;
        continue;
      }
      rawLessons.push({
        courseExternalId: course.code, // keyed by code (canonical)
        externalId: l.id,
        lessonNumber: l.lessonNumber,
        title: l.title,
        section: l.section ?? null,
        orderIndex: l.order ?? null,
        prerequisiteLessonIds: l.prerequisiteLessonIds ?? [],
        lessonUrl: l.lessonUrl ?? l.url ?? null,
        sourceType: l.sourceType ?? null,
      });
    }
  }
  const lessons = dedupeBy(
    "course_lessons",
    "(course_id, external_id)",
    rawLessons,
    (l) => `${l.courseExternalId}::${l.externalId}`
  );
  reports.push(lessons.report);

  // --- Source files: conflict on external_id ---
  const rawFiles: NormalizedSourceFile[] = (catalog.sourceFiles ?? []).map(
    (f) => ({
      externalId: f.id,
      title: f.title,
      fileType: f.fileType,
      storagePath: f.storagePath ?? null,
    })
  );
  const sourceFiles = dedupeBy(
    "source_files",
    "(workspace_id, external_id)",
    rawFiles,
    (f) => f.externalId
  );
  reports.push(sourceFiles.report);

  // --- Assessment sources: conflict on external_id ---
  const rawAssessments: NormalizedAssessment[] = (
    catalog.assessmentSources ?? []
  ).map((a) => ({
    externalId: a.id,
    type: a.type,
    subject: a.subject,
    title: a.title,
    courseCode: a.courseCode ?? null,
    lessonFrom: a.lessonFrom ?? null,
    lessonTo: a.lessonTo ?? null,
    sourceType: a.sourceType,
    sourceFileExternalId: a.sourceFileId ?? a.storageFileId ?? null,
    questionPageFrom: a.questionPages?.from ?? null,
    questionPageTo: a.questionPages?.to ?? null,
    answerPageFrom: a.answerPages?.from ?? null,
    answerPageTo: a.answerPages?.to ?? null,
    solutionPageFrom: a.solutionPages?.from ?? null,
    solutionPageTo: a.solutionPages?.to ?? null,
    coveredTopics: a.coveredTopics ?? [],
    requiredCompletedLessons: a.requiredCompletedLessons ?? [],
    passingPercentage: a.passingPercentage,
    notes: a.notes ?? null,
  }));
  const assessments = dedupeBy(
    "assessment_sources",
    "(workspace_id, external_id)",
    rawAssessments,
    (a) => a.externalId
  );
  reports.push(assessments.report);

  return {
    subjects: subjects.unique,
    courses: courses.unique,
    lessons: lessons.unique,
    sourceFiles: sourceFiles.unique,
    assessments: assessments.unique,
    skippedLessons,
    reports,
  };
}

/** Split an array into fixed-size chunks (for batched upserts). */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
