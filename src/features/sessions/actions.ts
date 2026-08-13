"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { validateIntervals } from "@/lib/dates";
import { planItemStatusEnum, timeString, dateString } from "@/lib/schemas/common";
import { statusFromActualMinutes } from "@/lib/study-execution";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

async function ownedPlanItem(planItemId: string, workspaceId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_items")
    .select("id, workspace_id, subject, date, lesson_from, lesson_to, target_minutes")
    .eq("id", planItemId)
    .maybeSingle();
  if (!data || data.workspace_id !== workspaceId) return null;
  return data as {
    id: string;
    workspace_id: string;
    subject: string;
    date: string;
    lesson_from: string | null;
    lesson_to: string | null;
    target_minutes: number;
  };
}

async function recomputePlanItemStatus(
  planItemId: string | null,
  workspaceId: string
): Promise<ActionResult> {
  if (!planItemId) return { ok: true };

  const item = await ownedPlanItem(planItemId, workspaceId);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

  const supabase = await createServerSupabase();
  const { data: sessions, error: sessionError } = await supabase
    .from("study_sessions")
    .select("duration_minutes")
    .eq("workspace_id", workspaceId)
    .eq("plan_item_id", planItemId);
  if (sessionError) return { ok: false, error: sessionError.message };

  const actualMinutes = (
    (sessions as Array<{ duration_minutes: number }> | null) ?? []
  ).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const status = statusFromActualMinutes(actualMinutes, item.target_minutes);

  const { error } = await supabase.from("item_status_overrides").upsert(
    {
      workspace_id: workspaceId,
      plan_item_id: planItemId,
      status,
      actual_lesson_from: item.lesson_from,
      actual_lesson_to: item.lesson_to,
    },
    { onConflict: "plan_item_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function revalidateStudyData() {
  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/plan");
  revalidatePath("/reviews");
  revalidatePath("/courses");
  revalidatePath("/assessments");
}

const addTimeSchema = z.object({
  planItemId: z.string().uuid(),
  sessionDate: dateString,
  intervals: z
    .array(z.object({ start: timeString, end: timeString }))
    .min(1),
  note: z.string().max(500).optional(),
});

/**
 * Add one or more time intervals for a plan item. Server is the source of
 * truth for duration; overlaps and end<=start are rejected.
 */
export async function addTimeIntervals(
  input: z.infer<typeof addTimeSchema>
): Promise<ActionResult> {
  const parsed = addTimeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const item = await ownedPlanItem(parsed.data.planItemId, workspace.id);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

  // Validate against existing sessions on the same date for the same item too.
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase
    .from("study_sessions")
    .select("start_time, end_time")
    .eq("plan_item_id", item.id)
    .eq("session_date", parsed.data.sessionDate);

  const existingIntervals = ((existing as Array<{ start_time: string | null; end_time: string | null }> | null) ?? [])
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({ start: s.start_time as string, end: s.end_time as string }));

  const validation = validateIntervals([
    ...existingIntervals,
    ...parsed.data.intervals,
  ]);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join("; ") };
  }

  const rows = parsed.data.intervals.map((iv) => {
    const single = validateIntervals([iv]);
    return {
      workspace_id: workspace.id,
      plan_item_id: item.id,
      subject: item.subject,
      session_date: parsed.data.sessionDate,
      start_time: iv.start,
      end_time: iv.end,
      duration_minutes: single.totalMinutes,
      status: "completed",
      actual_lesson_from: item.lesson_from,
      actual_lesson_to: item.lesson_to,
      note: parsed.data.note ?? null,
    };
  });

  const { error } = await supabase.from("study_sessions").insert(rows);
  if (error) return { ok: false, error: error.message };

  const recompute = await recomputePlanItemStatus(item.id, workspace.id);
  if (!recompute.ok) return recompute;

  revalidateStudyData();
  return { ok: true, message: `บันทึกเวลา ${validation.totalMinutes} นาทีแล้ว` };
}

const setStatusSchema = z.object({
  planItemId: z.string().uuid(),
  status: planItemStatusEnum,
  actualLessonFrom: z.string().optional(),
  actualLessonTo: z.string().optional(),
});

/** Set the execution status of a plan item (start/pause/resume/complete). */
export async function setItemStatus(
  input: z.infer<typeof setStatusSchema>
): Promise<ActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };
  const item = await ownedPlanItem(parsed.data.planItemId, workspace.id);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("item_status_overrides").upsert(
    {
      workspace_id: workspace.id,
      plan_item_id: item.id,
      status: parsed.data.status,
      actual_lesson_from: parsed.data.actualLessonFrom ?? null,
      actual_lesson_to: parsed.data.actualLessonTo ?? null,
    },
    { onConflict: "plan_item_id" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/plan");
  return { ok: true };
}

const deleteSessionSchema = z.object({ sessionId: z.string().uuid() });

const updateSessionSchema = z.object({
  sessionId: z.string().uuid(),
  sessionDate: dateString,
  startTime: timeString,
  endTime: timeString,
  note: z.string().max(500).optional(),
});

export async function updateStudySession(
  input: z.infer<typeof updateSessionSchema>
): Promise<ActionResult> {
  const parsed = updateSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const validation = validateIntervals([
    { start: parsed.data.startTime, end: parsed.data.endTime },
  ]);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join("; ") };
  }

  const supabase = await createServerSupabase();
  const { data: existingSession } = await supabase
    .from("study_sessions")
    .select("id, workspace_id, plan_item_id")
    .eq("id", parsed.data.sessionId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const existing = existingSession as {
    id: string;
    workspace_id: string;
    plan_item_id: string | null;
  } | null;
  if (!existing) return { ok: false, error: "ไม่พบ session หรือไม่มีสิทธิ์เข้าถึง" };

  if (existing.plan_item_id) {
    const { data: siblingRows } = await supabase
      .from("study_sessions")
      .select("id, start_time, end_time")
      .eq("workspace_id", workspace.id)
      .eq("plan_item_id", existing.plan_item_id)
      .eq("session_date", parsed.data.sessionDate);

    const siblingIntervals = (
      (siblingRows as Array<{
        id: string;
        start_time: string | null;
        end_time: string | null;
      }> | null) ?? []
    )
      .filter((s) => s.id !== existing.id && s.start_time && s.end_time)
      .map((s) => ({ start: s.start_time as string, end: s.end_time as string }));

    const overlapValidation = validateIntervals([
      ...siblingIntervals,
      { start: parsed.data.startTime, end: parsed.data.endTime },
    ]);
    if (!overlapValidation.ok) {
      return { ok: false, error: overlapValidation.errors.join("; ") };
    }
  }

  const { error } = await supabase
    .from("study_sessions")
    .update({
      session_date: parsed.data.sessionDate,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
      duration_minutes: validation.totalMinutes,
      note: parsed.data.note ?? null,
    })
    .eq("id", existing.id)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  const recompute = await recomputePlanItemStatus(existing.plan_item_id, workspace.id);
  if (!recompute.ok) return recompute;

  revalidateStudyData();
  return { ok: true, message: "แก้ไขประวัติการเรียนแล้ว" };
}

export async function deleteSession(
  input: z.infer<typeof deleteSessionSchema>
): Promise<ActionResult> {
  const parsed = deleteSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { data: existingSession } = await supabase
    .from("study_sessions")
    .select("id, plan_item_id")
    .eq("id", parsed.data.sessionId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const existing = existingSession as { id: string; plan_item_id: string | null } | null;
  if (!existing) return { ok: false, error: "ไม่พบ session หรือไม่มีสิทธิ์เข้าถึง" };

  const { error } = await supabase
    .from("study_sessions")
    .delete()
    .eq("id", existing.id)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  const recompute = await recomputePlanItemStatus(existing.plan_item_id, workspace.id);
  if (!recompute.ok) return recompute;

  revalidateStudyData();
  return { ok: true };
}
