"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { addDays, todayInTimezone } from "@/lib/dates";
import {
  generateRecoveryPlan,
  type RecoveryContext,
} from "@/lib/anthropic/recovery";
import { getActivePlanVersion, PLAN_ITEM_COLUMNS } from "@/features/plans/data";
import { activatePlanVersion } from "@/features/plans/actions";
import { preservePlanItemFields } from "@/lib/plans/item-preservation";
import type { RecoveryPlan } from "@/lib/schemas/recovery";
import type { PlanItem } from "@/types/db";

export interface RecoveryPreview {
  ok: boolean;
  error?: string;
  requestId?: string;
  mode?: "ai" | "mock";
  note?: string;
  plan?: RecoveryPlan;
}

/** Simple in-memory-ish rate guard: 1 request / 20s per workspace. */
const lastRequestAt = new Map<string, number>();

export async function requestRecovery(): Promise<RecoveryPreview> {
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const now = Date.now();
  const last = lastRequestAt.get(workspace.id) ?? 0;
  if (now - last < 20_000) {
    return { ok: false, error: "ขอ Recovery ถี่เกินไป กรุณารอสักครู่" };
  }
  lastRequestAt.set(workspace.id, now);

  const activeVersion = await getActivePlanVersion(workspace.id);
  if (!activeVersion) {
    return { ok: false, error: "ยังไม่มีแผนที่ active" };
  }

  const supabase = await createServerSupabase();
  const today = todayInTimezone(workspace.timezone);
  const effectiveFrom = addDays(today, 1);
  const weekAgo = addDays(today, -7);

  const [
    { data: pendingItems },
    { data: overdueReviews },
    { data: topicResults },
    { data: failedAttempts },
    { data: recentSessions },
    { data: completedLessons },
  ] = await Promise.all([
    supabase
      .from("study_plan_items")
      .select(PLAN_ITEM_COLUMNS)
      .eq("plan_version_id", activeVersion.id)
      .gte("date", today),
    supabase
      .from("review_tasks")
      .select("subject, due_date, reason")
      .eq("workspace_id", workspace.id)
      .eq("status", "pending")
      .lt("due_date", today),
    supabase
      .from("assessment_topic_results")
      .select("topic, error_type, is_weakness")
      .eq("workspace_id", workspace.id)
      .eq("is_weakness", true)
      .limit(50),
    supabase
      .from("assessment_attempts")
      .select("subject, percentage")
      .eq("workspace_id", workspace.id)
      .eq("passed", false)
      .limit(20),
    supabase
      .from("study_sessions")
      .select("duration_minutes")
      .eq("workspace_id", workspace.id)
      .gte("session_date", weekAgo),
    supabase
      .from("item_status_overrides")
      .select("actual_lesson_to, status")
      .eq("workspace_id", workspace.id)
      .eq("status", "completed")
      .limit(200),
  ]);

  const errorTypes = ((topicResults as Array<{ error_type: string | null }> | null) ?? [])
    .map((t) => t.error_type)
    .filter((t): t is string => Boolean(t));
  const repeated = Array.from(
    errorTypes.reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map<string, number>())
  )
    .filter(([, c]) => c >= 2)
    .map(([e]) => e);

  const ctx: RecoveryContext = {
    activePlanVersionId: activeVersion.id,
    effectiveFrom,
    dailyHourLimitMinutes: workspace.daily_target_minutes,
    studyConstraints: {},
    examDates: [],
    completedLessons: ((completedLessons as Array<{ actual_lesson_to: string | null }> | null) ?? [])
      .map((c) => c.actual_lesson_to)
      .filter((c): c is string => Boolean(c)),
    notYetLearnedLessons: [],
    pendingPlanItems: ((pendingItems as PlanItem[] | null) ?? []).map((i) => ({
      stableExternalId: i.stable_external_id,
      subject: i.subject,
      courseCode: i.course_code,
      lessonFrom: i.lesson_from,
      lessonTo: i.lesson_to,
      activityType: i.activity_type,
      assessmentSourceId: i.assessment_source_id,
      targetMinutes: i.target_minutes,
      priority: i.priority,
      instructions: i.instructions,
      resourceUrl: i.resource_url,
      resourceLabel: i.resource_label,
      reviewReferenceIds: i.review_reference_ids,
      metadata: i.metadata,
      date: i.date,
    })),
    overdueReviews: ((overdueReviews as Array<{ subject: string | null; due_date: string; reason: string | null }> | null) ?? []).map(
      (r) => ({ subject: r.subject, dueDate: r.due_date, reason: r.reason })
    ),
    weakTopics: Array.from(
      new Set(
        ((topicResults as Array<{ topic: string }> | null) ?? []).map((t) => t.topic)
      )
    ),
    failedAssessments: ((failedAttempts as Array<{ subject: string | null; percentage: number | null }> | null) ?? []).map(
      (a) => ({ subject: a.subject, percentage: a.percentage })
    ),
    repeatedErrorTypes: repeated,
    recentStudyMinutes: ((recentSessions as Array<{ duration_minutes: number }> | null) ?? []).reduce(
      (s, x) => s + (x.duration_minutes ?? 0),
      0
    ),
  };

  const outcome = await generateRecoveryPlan(ctx);

  const { data: reqRow, error: reqErr } = await supabase
    .from("recovery_requests")
    .insert({
      workspace_id: workspace.id,
      parent_plan_version_id: activeVersion.id,
      effective_from: effectiveFrom,
      trigger_reason: "manual",
      payload: ctx,
      mode: outcome.mode,
      status: "previewed",
    })
    .select("id")
    .single();
  if (reqErr) return { ok: false, error: reqErr.message };
  const requestId = (reqRow as { id: string }).id;

  await supabase.from("recovery_plan_results").insert({
    workspace_id: workspace.id,
    request_id: requestId,
    result: outcome.plan,
  });

  revalidatePath("/plan");
  return {
    ok: true,
    requestId,
    mode: outcome.mode,
    note: outcome.note,
    plan: outcome.plan,
  };
}

const confirmSchema = z.object({ requestId: z.string().uuid() });

/**
 * Confirm a previewed recovery: create a NEW draft plan version from the
 * recovery result and activate it. The parent version is never modified.
 */
export async function confirmRecovery(
  input: z.infer<typeof confirmSchema>
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { data: resultRow } = await supabase
    .from("recovery_plan_results")
    .select("id, result, request_id")
    .eq("request_id", parsed.data.requestId)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = resultRow as { id: string; result: RecoveryPlan; request_id: string } | null;
  if (!row) return { ok: false, error: "ไม่พบผล Recovery" };

  const plan = row.result;

  // next version number
  const { data: maxV } = await supabase
    .from("study_plan_versions")
    .select("version_number")
    .eq("workspace_id", workspace.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNumber = ((maxV as { version_number: number } | null)?.version_number ?? 0) + 1;

  const startDate = plan.days[0]?.date ?? plan.effectiveFrom;
  const endDate = plan.days[plan.days.length - 1]?.date ?? plan.effectiveFrom;

  const { data: versionRow, error: vErr } = await supabase
    .from("study_plan_versions")
    .insert({
      workspace_id: workspace.id,
      version_number: versionNumber,
      name: `Recovery Plan v${versionNumber}`,
      description: plan.reason,
      start_date: startDate,
      end_date: endDate,
      status: "draft",
      generated_by: "claude_recovery",
      change_reason: plan.reason,
      parent_version_id: plan.parentPlanVersionId,
    })
    .select("id")
    .single();
  if (vErr) return { ok: false, error: vErr.message };
  const versionId = (versionRow as { id: string }).id;

  const { data: parentItemRows } = await supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspace.id)
    .eq("plan_version_id", plan.parentPlanVersionId);
  const parentItemsMap = new Map<string, PlanItem>(
    ((parentItemRows as PlanItem[] | null) ?? []).map((p) => [p.stable_external_id, p])
  );

  let queuePosition = 1;
  for (const day of plan.days) {
    const { data: dayRow, error: dayErr } = await supabase
      .from("study_plan_days")
      .insert({
        workspace_id: workspace.id,
        plan_version_id: versionId,
        date: day.date,
        target_minutes: day.targetMinutes,
        nap_target_minutes: day.napTargetMinutes ?? 0,
        notes: day.notes ?? "",
      })
      .select("id")
      .single();
    if (dayErr) return { ok: false, error: dayErr.message };
    const dayId = (dayRow as { id: string }).id;

    if (day.items.length > 0) {
      const itemRows = day.items.map((item) => {
        const sourceItem = parentItemsMap.get(item.stableExternalId) ?? null;
        const preserved = preservePlanItemFields(item, sourceItem, {
          extraMetadata: { recovery: true },
        });
        return {
          workspace_id: workspace.id,
          plan_version_id: versionId,
          plan_day_id: dayId,
          date: day.date,
          stable_external_id: preserved.stable_external_id,
          subject: preserved.subject,
          course_code: preserved.course_code,
          lesson_from: preserved.lesson_from,
          lesson_to: preserved.lesson_to,
          activity_type: preserved.activity_type,
          assessment_source_id: preserved.assessment_source_id,
          target_minutes: preserved.target_minutes,
          priority: preserved.priority,
          instructions: preserved.instructions,
          resource_url: preserved.resource_url,
          resource_label: preserved.resource_label,
          review_reference_ids: preserved.review_reference_ids,
          metadata: preserved.metadata,
          order_index: queuePosition++,
          scheduled_at: item.scheduledAt ?? null,
        };
      });
      const { error: itemErr } = await supabase
        .from("study_plan_items")
        .insert(itemRows);
      if (itemErr) return { ok: false, error: itemErr.message };
    }
  }

  const activation = await activatePlanVersion({
    versionId,
    effectiveFrom: plan.effectiveFrom,
  });
  if (!activation.ok) return activation;

  await supabase
    .from("recovery_requests")
    .update({ status: "applied" })
    .eq("id", parsed.data.requestId);
  await supabase
    .from("recovery_plan_results")
    .update({ applied_plan_version_id: versionId })
    .eq("id", row.id);

  revalidatePath("/plan");
  revalidatePath("/today");
  return { ok: true, message: `สร้างและเปิดใช้ Recovery Plan v${versionNumber} แล้ว` };
}
