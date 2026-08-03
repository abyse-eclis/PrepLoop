"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser, getActiveWorkspace } from "@/lib/auth/workspace";
import {
  parseJsonWithSchema,
  type ImportType,
  type ParseIssue,
} from "@/lib/schemas";
import { workspaceConfigSchema } from "@/lib/schemas/workspace-config";
import { learningSourceCatalogSchema } from "@/lib/schemas/learning-source";
import { studyPlanSchema } from "@/lib/schemas/study-plan";

export interface ImportResult {
  ok: boolean;
  issues?: ParseIssue[];
  error?: string;
  message?: string;
  summary?: Record<string, number>;
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
  const parsed = parseJsonWithSchema(raw, learningSourceCatalogSchema);
  if (!parsed.ok || !parsed.data) {
    return { ok: false, issues: parsed.issues };
  }
  const catalog = parsed.data;
  const supabase = await createServerSupabase();

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
  if (catErr) return { ok: false, error: catErr.message };
  const catalogVersionId = (catVersion as { id: string }).id;

  let lessonCount = 0;
  for (const course of catalog.courses) {
    const { data: courseRow, error: courseErr } = await supabase
      .from("courses")
      .upsert(
        {
          workspace_id: workspace.id,
          catalog_version_id: catalogVersionId,
          external_id: course.id,
          code: course.code,
          name: course.name,
          subject: course.subject,
          total_lessons: course.totalLessons ?? course.lessons.length,
        },
        { onConflict: "workspace_id,code" }
      )
      .select("id")
      .single();
    if (courseErr) return { ok: false, error: courseErr.message };
    const courseId = (courseRow as { id: string }).id;

    // Subject registry
    await supabase
      .from("subjects")
      .upsert(
        { workspace_id: workspace.id, code: course.subject, name: course.subject },
        { onConflict: "workspace_id,code" }
      );

    if (course.lessons.length > 0) {
      const lessonRows = course.lessons.map((l) => ({
        workspace_id: workspace.id,
        course_id: courseId,
        external_id: l.id,
        lesson_number: l.lessonNumber,
        title: l.title,
        section: l.section ?? null,
        order_index: l.order ?? null,
        prerequisite_lesson_ids: l.prerequisiteLessonIds ?? [],
      }));
      const { error: lessonErr } = await supabase
        .from("course_lessons")
        .upsert(lessonRows, { onConflict: "course_id,external_id" });
      if (lessonErr) return { ok: false, error: lessonErr.message };
      lessonCount += lessonRows.length;
    }
  }

  // Source files
  const fileIdMap = new Map<string, string>();
  for (const f of catalog.sourceFiles) {
    const { data: fileRow, error: fileErr } = await supabase
      .from("source_files")
      .insert({
        workspace_id: workspace.id,
        external_id: f.id,
        title: f.title,
        file_type: f.fileType,
        storage_path: f.storagePath ?? null,
      })
      .select("id")
      .single();
    if (fileErr) return { ok: false, error: fileErr.message };
    fileIdMap.set(f.id, (fileRow as { id: string }).id);
  }

  // Assessment sources
  for (const a of catalog.assessmentSources) {
    const sourceFileId = a.sourceFileId
      ? fileIdMap.get(a.sourceFileId) ?? null
      : null;
    const { error: aErr } = await supabase.from("assessment_sources").upsert(
      {
        workspace_id: workspace.id,
        external_id: a.id,
        type: a.type,
        subject: a.subject,
        title: a.title,
        course_code: a.courseCode ?? null,
        lesson_from: a.lessonFrom ?? null,
        lesson_to: a.lessonTo ?? null,
        source_type: a.sourceType,
        source_file_id: sourceFileId,
        question_page_from: a.questionPages?.from ?? null,
        question_page_to: a.questionPages?.to ?? null,
        answer_page_from: a.answerPages?.from ?? null,
        answer_page_to: a.answerPages?.to ?? null,
        solution_page_from: a.solutionPages?.from ?? null,
        solution_page_to: a.solutionPages?.to ?? null,
        covered_topics: a.coveredTopics ?? [],
        required_completed_lessons: a.requiredCompletedLessons ?? [],
        passing_percentage: a.passingPercentage,
        notes: a.notes ?? null,
      },
      { onConflict: "workspace_id,external_id" }
    );
    if (aErr) return { ok: false, error: aErr.message };
  }

  await supabase
    .from("workspaces")
    .update({ active_catalog_version_id: catalogVersionId })
    .eq("id", workspace.id);

  const summary = {
    courses: catalog.courses.length,
    lessons: lessonCount,
    sourceFiles: catalog.sourceFiles.length,
    assessmentSources: catalog.assessmentSources.length,
    catalogVersion: versionNumber,
  };
  await recordImport(workspace.id, "learning_source", summary);

  revalidatePath("/courses");
  revalidatePath("/assessments");
  return {
    ok: true,
    message: `นำเข้า Learning Source สำเร็จ (เวอร์ชัน ${versionNumber})`,
    summary,
  };
}

/** Import Full Study Plan as a DRAFT version (activated separately on /plan). */
export async function importStudyPlan(raw: string): Promise<ImportResult> {
  await requireUser();
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return { ok: false, error: "กรุณานำเข้า Workspace Config ก่อน" };
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
