"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser, getActiveWorkspace } from "@/lib/auth/workspace";
import {
  parseJsonWithSchema,
  IMPORT_TYPE_LABELS,
  type ImportType,
  type ParseIssue,
} from "@/lib/schemas";
import { workspaceConfigSchema } from "@/lib/schemas/workspace-config";
import { learningSourceCatalogSchema } from "@/lib/schemas/learning-source";
import { studyPlanSchema } from "@/lib/schemas/study-plan";
import { executionHistorySchema } from "@/lib/schemas/execution-history";
import { detectImportType } from "@/lib/imports/detect";
import {
  normalizeLearningSource,
  chunk,
} from "@/lib/imports/learning-source-normalize";
import {
  normalizeExecutionHistory,
  type HistoryRecordIssue,
} from "@/lib/imports/execution-history-normalize";
import {
  classifyChanges,
  type EntityImportSummary,
  type LearningSourceImportSummary,
} from "@/lib/imports/summary";
import {
  classifyPgError,
  userMessageFor,
  type AppErrorCode,
} from "@/lib/imports/errors";

const LESSON_BATCH_SIZE = 400;

export interface ImportDebug {
  entity?: string;
  table?: string;
  conflictTarget?: string;
  batch?: number;
  rowCount?: number;
  pgCode?: string;
  pgMessage?: string;
  details?: string;
  hint?: string;
}

export interface HistoryImportSummary {
  created: number;
  skippedDuplicate: number;
  failed: number;
  totalMinutes: number;
  dayCount: number;
  recordIssues: HistoryRecordIssue[];
}

export interface ImportResult {
  ok: boolean;
  issues?: ParseIssue[];
  error?: string;
  errorCode?: AppErrorCode;
  message?: string;
  summary?: Record<string, number>;
  learningSummary?: LearningSourceImportSummary;
  historySummary?: HistoryImportSummary;
  debug?: ImportDebug;
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Build a structured import failure. The user sees a friendly Thai message
 * mapped from the PG error code; technical detail is logged server-side and
 * only echoed to the client in development.
 */
function importFailure(
  context: ImportDebug,
  pgError: { code?: string; message?: string; details?: string; hint?: string } | null
): ImportResult {
  const debug: ImportDebug = {
    ...context,
    pgCode: pgError?.code,
    pgMessage: pgError?.message,
    details: pgError?.details,
    hint: pgError?.hint,
  };
  // Structured technical log (never shown to end users in production).
  // eslint-disable-next-line no-console
  console.error("[import] failure", debug);

  const code = classifyPgError(pgError);
  const userMsg = `${userMessageFor(code)} (ขั้นตอน: ${context.entity ?? "ไม่ทราบ"})`;
  return {
    ok: false,
    errorCode: code,
    error: isDev ? `${userMsg} [${debug.pgCode ?? "?"}] ${debug.pgMessage ?? ""}` : userMsg,
    debug: isDev ? debug : undefined,
  };
}

async function nextVersionNumber(
  table: string,
  workspaceId: string
): Promise<number> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from(table)
    .select("version_number")
    .eq("workspace_id", workspaceId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const current = (data as { version_number: number } | null)?.version_number ?? 0;
  return current + 1;
}

/** Import Workspace Config — creates the workspace on first import. */
export async function importWorkspaceConfig(raw: string): Promise<ImportResult> {
  const { user } = await requireUser();
  const detected = detectImportType(safeJsonParse(raw));
  if (detected && detected !== "workspace_config") {
    return {
      ok: false,
      error: `ข้อมูลนี้มีโครงสร้างเป็น ${IMPORT_TYPE_LABELS[detected]} แต่ประเภทที่เลือกคือ ${IMPORT_TYPE_LABELS["workspace_config"]} กรุณาเปลี่ยนประเภทก่อนนำเข้า`,
    };
  }
  const parsed = parseJsonWithSchema(raw, workspaceConfigSchema);
  if (!parsed.ok || !parsed.data) {
    return { ok: false, issues: parsed.issues };
  }
  const cfg = parsed.data;
  const supabase = await createServerSupabase();

  let workspace = await getActiveWorkspace();
  if (!workspace) {
    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        user_id: user.id,
        name: cfg.workspace.name,
        timezone: cfg.workspace.timezone,
        start_date: cfg.workspace.startDate,
        daily_target_minutes: cfg.workspace.dailyTargetMinutes,
        nap_target_min: cfg.workspace.napTargetMinutes.min,
        nap_target_max: cfg.workspace.napTargetMinutes.max,
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    workspace = data as typeof workspace;
  } else {
    // Update mutable workspace fields (config content stays immutable in versions).
    await supabase
      .from("workspaces")
      .update({
        name: cfg.workspace.name,
        timezone: cfg.workspace.timezone,
        start_date: cfg.workspace.startDate,
        daily_target_minutes: cfg.workspace.dailyTargetMinutes,
        nap_target_min: cfg.workspace.napTargetMinutes.min,
        nap_target_max: cfg.workspace.napTargetMinutes.max,
      })
      .eq("id", workspace.id);
  }
  if (!workspace) return { ok: false, error: "สร้าง workspace ไม่สำเร็จ" };

  const versionNumber = await nextVersionNumber(
    "workspace_config_versions",
    workspace.id
  );
  const { data: cfgVersion, error: cfgErr } = await supabase
    .from("workspace_config_versions")
    .insert({
      workspace_id: workspace.id,
      version_number: versionNumber,
      config: cfg,
      generated_by: "manual_import",
    })
    .select("id")
    .single();
  if (cfgErr) return { ok: false, error: cfgErr.message };

  await supabase
    .from("workspaces")
    .update({ active_config_version_id: (cfgVersion as { id: string }).id })
    .eq("id", workspace.id);

  const summary = {
    examEvents: cfg.examEvents.length,
    scoreTargets: cfg.scoreTargets.length,
    configVersion: versionNumber,
  };
  await recordImport(workspace.id, "workspace_config", summary);

  revalidatePath("/today");
  revalidatePath("/settings");
  return {
    ok: true,
    message: `นำเข้า Workspace Config สำเร็จ (เวอร์ชัน ${versionNumber})`,
    summary,
  };
}

/** Import Learning Source Catalog. */
export async function importLearningSource(raw: string): Promise<ImportResult> {
  await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return { ok: false, error: "กรุณานำเข้า Workspace Config ก่อน" };
  }
  // Guard: reject when the JSON structure does not match the selected type.
  const detected = detectImportType(safeJsonParse(raw));
  if (detected && detected !== "learning_source") {
    return {
      ok: false,
      error: `ข้อมูลนี้มีโครงสร้างเป็น ${IMPORT_TYPE_LABELS[detected]} แต่ประเภทที่เลือกคือ ${IMPORT_TYPE_LABELS["learning_source"]} กรุณาเปลี่ยนประเภทก่อนนำเข้า`,
    };
  }

  const parsed = parseJsonWithSchema(raw, learningSourceCatalogSchema);
  if (!parsed.ok || !parsed.data) {
    return { ok: false, issues: parsed.issues };
  }
  const catalog = parsed.data;
  const supabase = await createServerSupabase();

  // 1) Deduplicate everything against the REAL DB conflict keys up front, so a
  //    single upsert statement can never affect the same row twice.
  const norm = normalizeLearningSource(catalog);

  // 2) Immutable catalog snapshot (audit).
  const versionNumber = await nextVersionNumber(
    "course_catalog_versions",
    workspace.id
  );
  const { data: catVersion, error: catErr } = await supabase
    .from("course_catalog_versions")
    .insert({
      workspace_id: workspace.id,
      version_number: versionNumber,
      catalog_name: catalog.catalogName,
      raw: catalog,
    })
    .select("id")
    .single();
  if (catErr) {
    return importFailure(
      { entity: "catalog snapshot", table: "course_catalog_versions" },
      catErr
    );
  }
  const catalogVersionId = (catVersion as { id: string }).id;

  // --- Classify against existing rows (for new/updated/unchanged summary) ---
  const [{ data: existCoursesRaw }, { data: existAssessRaw }, { data: existFilesRaw }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("code, name, subject, total_lessons")
        .eq("workspace_id", workspace.id),
      supabase
        .from("assessment_sources")
        .select("external_id, title, passing_percentage, type, subject")
        .eq("workspace_id", workspace.id),
      supabase
        .from("source_files")
        .select("external_id, title, file_type")
        .eq("workspace_id", workspace.id)
        .not("external_id", "is", null),
    ]);

  const existingCourses = new Map(
    ((existCoursesRaw as Array<{ code: string; name: string; subject: string; total_lessons: number | null }> | null) ?? []).map(
      (c) => [c.code, c]
    )
  );
  const coursesCounts = classifyChanges({
    incoming: norm.courses,
    existing: existingCourses,
    keyOf: (c) => c.code,
    signatureIncoming: (c) => `${c.name}|${c.subject}|${c.totalLessons ?? ""}`,
    signatureExisting: (c) => `${c.name}|${c.subject}|${c.total_lessons ?? ""}`,
  });

  // 3) Subjects (batched upsert, deduped).
  if (norm.subjects.length > 0) {
    const { error } = await supabase.from("subjects").upsert(
      norm.subjects.map((s) => ({
        workspace_id: workspace.id,
        code: s.code,
        name: s.name,
      })),
      { onConflict: "workspace_id,code" }
    );
    if (error) {
      return importFailure(
        { entity: "subjects", table: "subjects", conflictTarget: "workspace_id,code", rowCount: norm.subjects.length },
        error
      );
    }
  }

  // 4) Courses (batched upsert, deduped) → resolve code → db id map.
  const { data: courseRows, error: courseErr } = await supabase
    .from("courses")
    .upsert(
      norm.courses.map((c) => ({
        workspace_id: workspace.id,
        catalog_version_id: catalogVersionId,
        external_id: c.externalId,
        code: c.code,
        name: c.name,
        subject: c.subject,
        total_lessons: c.totalLessons,
      })),
      { onConflict: "workspace_id,code" }
    )
    .select("id, code");
  if (courseErr) {
    return importFailure(
      { entity: "courses", table: "courses", conflictTarget: "workspace_id,code", rowCount: norm.courses.length },
      courseErr
    );
  }
  const courseIdByCode = new Map(
    ((courseRows as Array<{ id: string; code: string }> | null) ?? []).map((c) => [
      c.code,
      c.id,
    ])
  );

  // 5) Lessons (deduped on (course_id, external_id)) — batched in chunks.
  const lessonRows = norm.lessons
    .map((l) => {
      const courseId = courseIdByCode.get(l.courseExternalId);
      if (!courseId) return null;
      return {
        workspace_id: workspace.id,
        course_id: courseId,
        external_id: l.externalId,
        lesson_number: l.lessonNumber,
        title: l.title,
        section: l.section,
        order_index: l.orderIndex,
        prerequisite_lesson_ids: l.prerequisiteLessonIds,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Classify lessons new/updated/unchanged.
  const courseIds = Array.from(courseIdByCode.values());
  const existingLessons = new Map<string, { lesson_number: string; title: string }>();
  if (courseIds.length > 0) {
    const { data: existLessons } = await supabase
      .from("course_lessons")
      .select("course_id, external_id, lesson_number, title")
      .in("course_id", courseIds);
    for (const l of (existLessons as Array<{ course_id: string; external_id: string; lesson_number: string; title: string }> | null) ?? []) {
      existingLessons.set(`${l.course_id}::${l.external_id}`, {
        lesson_number: l.lesson_number,
        title: l.title,
      });
    }
  }
  const lessonsCounts = classifyChanges({
    incoming: lessonRows,
    existing: existingLessons,
    keyOf: (l) => `${l.course_id}::${l.external_id}`,
    signatureIncoming: (l) => `${l.lesson_number}|${l.title}`,
    signatureExisting: (l) => `${l.lesson_number}|${l.title}`,
  });

  let batchNo = 0;
  for (const batch of chunk(lessonRows, LESSON_BATCH_SIZE)) {
    batchNo++;
    const { error } = await supabase
      .from("course_lessons")
      .upsert(batch, { onConflict: "course_id,external_id" });
    if (error) {
      return importFailure(
        {
          entity: "lessons",
          table: "course_lessons",
          conflictTarget: "course_id,external_id",
          batch: batchNo,
          rowCount: batch.length,
        },
        error
      );
    }
  }

  // 6) Source files (catalog metadata; deduped on external_id) — batched upsert.
  const existingFiles = new Map(
    ((existFilesRaw as Array<{ external_id: string | null; title: string; file_type: string }> | null) ?? [])
      .filter((f) => f.external_id)
      .map((f) => [f.external_id as string, f])
  );
  const filesCounts = classifyChanges({
    incoming: norm.sourceFiles,
    existing: existingFiles,
    keyOf: (f) => f.externalId,
    signatureIncoming: (f) => `${f.title}|${f.fileType}`,
    signatureExisting: (f) => `${f.title}|${f.file_type}`,
  });
  if (norm.sourceFiles.length > 0) {
    const { error } = await supabase.from("source_files").upsert(
      norm.sourceFiles.map((f) => ({
        workspace_id: workspace.id,
        external_id: f.externalId,
        title: f.title,
        display_name: f.title,
        original_file_name: f.title,
        file_type: f.fileType,
        mime_type: f.fileType,
        storage_path: f.storagePath,
      })),
      { onConflict: "workspace_id,external_id" }
    );
    if (error) {
      return importFailure(
        { entity: "source files", table: "source_files", conflictTarget: "workspace_id,external_id", rowCount: norm.sourceFiles.length },
        error
      );
    }
  }

  // Resolve source_file external_id -> db id for assessment linkage.
  const fileIdByExternal = new Map<string, string>();
  if (norm.sourceFiles.length > 0) {
    const { data: fileRows } = await supabase
      .from("source_files")
      .select("id, external_id")
      .eq("workspace_id", workspace.id)
      .not("external_id", "is", null);
    for (const f of (fileRows as Array<{ id: string; external_id: string }> | null) ?? []) {
      fileIdByExternal.set(f.external_id, f.id);
    }
  }

  // 7) Assessment sources (deduped on external_id) — batched upsert.
  const existingAssessments = new Map(
    ((existAssessRaw as Array<{ external_id: string; title: string; passing_percentage: number; type: string; subject: string }> | null) ?? []).map(
      (a) => [a.external_id, a]
    )
  );
  const assessmentsCounts = classifyChanges({
    incoming: norm.assessments,
    existing: existingAssessments,
    keyOf: (a) => a.externalId,
    signatureIncoming: (a) => `${a.title}|${a.passingPercentage}|${a.type}|${a.subject}`,
    signatureExisting: (a) => `${a.title}|${a.passing_percentage}|${a.type}|${a.subject}`,
  });
  if (norm.assessments.length > 0) {
    const { error } = await supabase.from("assessment_sources").upsert(
      norm.assessments.map((a) => ({
        workspace_id: workspace.id,
        external_id: a.externalId,
        type: a.type,
        subject: a.subject,
        title: a.title,
        course_code: a.courseCode,
        lesson_from: a.lessonFrom,
        lesson_to: a.lessonTo,
        source_type: a.sourceType,
        source_file_id: a.sourceFileExternalId
          ? fileIdByExternal.get(a.sourceFileExternalId) ?? null
          : null,
        question_page_from: a.questionPageFrom,
        question_page_to: a.questionPageTo,
        answer_page_from: a.answerPageFrom,
        answer_page_to: a.answerPageTo,
        solution_page_from: a.solutionPageFrom,
        solution_page_to: a.solutionPageTo,
        covered_topics: a.coveredTopics,
        required_completed_lessons: a.requiredCompletedLessons,
        passing_percentage: a.passingPercentage,
        notes: a.notes,
      })),
      { onConflict: "workspace_id,external_id" }
    );
    if (error) {
      return importFailure(
        { entity: "assessment sources", table: "assessment_sources", conflictTarget: "workspace_id,external_id", rowCount: norm.assessments.length },
        error
      );
    }
  }

  await supabase
    .from("workspaces")
    .update({ active_catalog_version_id: catalogVersionId })
    .eq("id", workspace.id);

  const dupByEntity = new Map(norm.reports.map((r) => [r.entity, r]));
  const entities: EntityImportSummary[] = [
    { entity: "courses", ...coursesCounts, duplicatesRemoved: dupByEntity.get("courses")?.duplicatesRemoved ?? 0 },
    { entity: "lessons", ...lessonsCounts, duplicatesRemoved: dupByEntity.get("course_lessons")?.duplicatesRemoved ?? 0 },
    { entity: "sourceFiles", ...filesCounts, duplicatesRemoved: dupByEntity.get("source_files")?.duplicatesRemoved ?? 0 },
    { entity: "assessments", ...assessmentsCounts, duplicatesRemoved: dupByEntity.get("assessment_sources")?.duplicatesRemoved ?? 0 },
  ];
  const duplicateNotes = norm.reports
    .filter((r) => r.duplicatesRemoved > 0)
    .map(
      (r) =>
        `${r.entity} (${r.conflictKey}): รวมข้อมูลซ้ำ ${r.duplicatesRemoved} รายการ${
          r.duplicateKeys.length ? ` เช่น ${r.duplicateKeys.slice(0, 3).join(", ")}` : ""
        }`
    );

  const learningSummary: LearningSourceImportSummary = {
    catalogVersion: versionNumber,
    entities,
    skippedInvalid: norm.skippedLessons,
    duplicateNotes,
  };

  const summary = {
    courses: norm.courses.length,
    lessons: lessonRows.length,
    sourceFiles: norm.sourceFiles.length,
    assessmentSources: norm.assessments.length,
    catalogVersion: versionNumber,
  };
  await recordImport(workspace.id, "learning_source", summary);

  revalidatePath("/courses");
  revalidatePath("/assessments");
  revalidatePath("/imports");
  return {
    ok: true,
    message: `นำเข้า Learning Source สำเร็จ (เวอร์ชัน ${versionNumber})`,
    summary,
    learningSummary,
  };
}

/** Best-effort JSON parse that never throws (for pre-validation type detection). */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Import Full Study Plan as a DRAFT version (activated separately on /plan). */
export async function importStudyPlan(raw: string): Promise<ImportResult> {
  await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return { ok: false, error: "กรุณานำเข้า Workspace Config ก่อน" };
  }
  const detected = detectImportType(safeJsonParse(raw));
  if (detected && detected !== "study_plan") {
    return {
      ok: false,
      error: `ข้อมูลนี้มีโครงสร้างเป็น ${IMPORT_TYPE_LABELS[detected]} แต่ประเภทที่เลือกคือ ${IMPORT_TYPE_LABELS["study_plan"]} กรุณาเปลี่ยนประเภทก่อนนำเข้า`,
    };
  }
  const parsed = parseJsonWithSchema(raw, studyPlanSchema);
  if (!parsed.ok || !parsed.data) {
    return { ok: false, issues: parsed.issues };
  }
  const plan = parsed.data;
  const supabase = await createServerSupabase();

  const versionNumber = await nextVersionNumber(
    "study_plan_versions",
    workspace.id
  );

  const { data: versionRow, error: vErr } = await supabase
    .from("study_plan_versions")
    .insert({
      workspace_id: workspace.id,
      version_number: versionNumber,
      name: plan.name,
      description: plan.description,
      start_date: plan.startDate,
      end_date: plan.endDate,
      status: "draft",
      generated_by: plan.generatedBy,
      change_reason: plan.changeReason ?? null,
      parent_version_id: plan.parentPlanVersionId ?? null,
    })
    .select("id")
    .single();
  if (vErr) return { ok: false, error: vErr.message };
  const versionId = (versionRow as { id: string }).id;

  let itemCount = 0;
  for (const day of plan.days) {
    const { data: dayRow, error: dayErr } = await supabase
      .from("study_plan_days")
      .insert({
        workspace_id: workspace.id,
        plan_version_id: versionId,
        date: day.date,
        target_minutes: day.targetMinutes,
        nap_target_minutes: day.napTargetMinutes,
        notes: day.notes,
      })
      .select("id")
      .single();
    if (dayErr) return { ok: false, error: dayErr.message };
    const dayId = (dayRow as { id: string }).id;

    if (day.items.length > 0) {
      const itemRows = day.items.map((item) => ({
        workspace_id: workspace.id,
        plan_version_id: versionId,
        plan_day_id: dayId,
        date: day.date,
        stable_external_id: item.stableExternalId,
        subject: item.subject,
        course_code: item.courseCode ?? null,
        lesson_from: item.lessonFrom ?? null,
        lesson_to: item.lessonTo ?? null,
        activity_type: item.activityType,
        assessment_source_id: item.assessmentSourceId ?? null,
        target_minutes: item.targetMinutes,
        priority: item.priority,
        instructions: item.instructions,
        review_reference_ids: item.reviewReferenceIds ?? [],
        metadata: item.metadata ?? null,
      }));
      const { error: itemErr } = await supabase
        .from("study_plan_items")
        .insert(itemRows);
      if (itemErr) return { ok: false, error: itemErr.message };
      itemCount += itemRows.length;
    }
  }

  const summary = {
    days: plan.days.length,
    items: itemCount,
    planVersion: versionNumber,
  };
  await recordImport(workspace.id, "study_plan", summary);

  revalidatePath("/plan");
  return {
    ok: true,
    message: `นำเข้าแผนเป็นฉบับร่าง (เวอร์ชัน ${versionNumber}) — ไปที่หน้าแผนเพื่อเปิดใช้งาน`,
    summary,
  };
}

/**
 * Import Execution History (reference format) → study_sessions.
 * Records are normalized to sessions, deduped within the file AND against
 * existing rows, then inserted in one atomic statement (all-or-nothing).
 */
export async function importExecutionHistory(raw: string): Promise<ImportResult> {
  await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return { ok: false, errorCode: "AUTH_REQUIRED", error: "กรุณานำเข้า Workspace Config ก่อน" };
  }
  const detected = detectImportType(safeJsonParse(raw));
  if (detected && detected !== "execution_history") {
    return {
      ok: false,
      errorCode: "SCHEMA_MISMATCH",
      error: `ข้อมูลนี้มีโครงสร้างเป็น ${IMPORT_TYPE_LABELS[detected]} แต่ประเภทที่เลือกคือ ${IMPORT_TYPE_LABELS["execution_history"]} กรุณาเปลี่ยนประเภทก่อนนำเข้า`,
    };
  }
  const parsed = parseJsonWithSchema(raw, executionHistorySchema);
  if (!parsed.ok || !parsed.data) {
    return { ok: false, errorCode: "VALIDATION_ERROR", issues: parsed.issues };
  }

  const norm = normalizeExecutionHistory(parsed.data);
  if (norm.sessions.length === 0) {
    return {
      ok: false,
      errorCode: "VALIDATION_ERROR",
      error: "ไม่มี session ที่นำเข้าได้จากไฟล์นี้",
      historySummary: {
        created: 0,
        skippedDuplicate: norm.duplicatesInFile,
        failed: norm.issues.length,
        totalMinutes: 0,
        dayCount: 0,
        recordIssues: norm.issues,
      },
    };
  }

  const supabase = await createServerSupabase();

  // Resolve plan-item external ids -> db ids (for linkage) in one query.
  const externalIds = Array.from(
    new Set(norm.sessions.map((s) => s.planItemExternalId).filter((v): v is string => !!v))
  );
  const planItemIdByExternal = new Map<string, string>();
  if (externalIds.length > 0) {
    const { data: items } = await supabase
      .from("study_plan_items")
      .select("id, stable_external_id")
      .eq("workspace_id", workspace.id)
      .in("stable_external_id", externalIds);
    for (const it of (items as Array<{ id: string; stable_external_id: string }> | null) ?? []) {
      planItemIdByExternal.set(it.stable_external_id, it.id);
    }
  }

  // Dedup against existing sessions (same date+start+end).
  const dates = Array.from(new Set(norm.sessions.map((s) => s.sessionDate)));
  const existingKeys = new Set<string>();
  const { data: existingSessions } = await supabase
    .from("study_sessions")
    .select("session_date, start_time, end_time, subject")
    .eq("workspace_id", workspace.id)
    .in("session_date", dates);
  for (const s of (existingSessions as Array<{ session_date: string; start_time: string | null; end_time: string | null; subject: string | null }> | null) ?? []) {
    existingKeys.add(`${s.session_date}|${s.start_time ?? ""}|${s.end_time ?? ""}|${s.subject ?? ""}`);
  }

  const rows: Array<Record<string, unknown>> = [];
  let skippedDuplicate = norm.duplicatesInFile;
  for (const s of norm.sessions) {
    const existKey = `${s.sessionDate}|${s.startTime ?? ""}|${s.endTime ?? ""}|${s.subject ?? ""}`;
    if (existingKeys.has(existKey)) {
      skippedDuplicate++;
      continue;
    }
    rows.push({
      workspace_id: workspace.id,
      plan_item_id: s.planItemExternalId
        ? planItemIdByExternal.get(s.planItemExternalId) ?? null
        : null,
      subject: s.subject,
      session_date: s.sessionDate,
      start_time: s.startTime,
      end_time: s.endTime,
      duration_minutes: s.durationMinutes,
      status: s.status,
      actual_lesson_from: s.lessonFrom,
      actual_lesson_to: s.lessonTo,
      note: s.note,
    });
  }

  let created = 0;
  if (rows.length > 0) {
    // Single atomic insert — all rows or none.
    const { error } = await supabase.from("study_sessions").insert(rows);
    if (error) {
      return importFailure(
        { entity: "study sessions", table: "study_sessions", rowCount: rows.length },
        error
      );
    }
    created = rows.length;
  }

  const summary = {
    sessions: created,
    days: norm.dayCount,
    totalMinutes: norm.totalMinutes,
  };
  await recordImport(workspace.id, "execution_history", summary);

  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/imports");
  return {
    ok: true,
    message: `นำเข้าประวัติการเรียนสำเร็จ: ${created} sessions (${norm.dayCount} วัน)`,
    summary,
    historySummary: {
      created,
      skippedDuplicate,
      failed: norm.issues.length,
      totalMinutes: norm.totalMinutes,
      dayCount: norm.dayCount,
      recordIssues: norm.issues,
    },
  };
}

async function recordImport(
  workspaceId: string,
  type: ImportType,
  summary: Record<string, number>
) {
  const supabase = await createServerSupabase();
  await supabase.from("import_history").insert({
    workspace_id: workspaceId,
    import_type: type,
    summary,
  });
}
