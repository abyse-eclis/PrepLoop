"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { validateIntervals } from "@/lib/dates";
import { planItemStatusEnum, timeString, dateString } from "@/lib/schemas/common";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

async function ensureDailySnapshot(workspaceId: string, planItemId: string, reason: string) {
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("study_plan_items").select("plan_version_id, date").eq("id", planItemId).eq("workspace_id", workspaceId).maybeSingle();
  if (!item) return;
  const { data: existing } = await supabase.from("daily_plan_snapshots").select("id").eq("workspace_id", workspaceId).eq("snapshot_date", item.date).maybeSingle();
  if (existing) return;
  const { data: items } = await supabase.from("study_plan_items").select("id, stable_external_id, subject, course_code, lesson_from, lesson_to, activity_type, target_minutes, priority, instructions").eq("workspace_id", workspaceId).eq("plan_version_id", item.plan_version_id).eq("date", item.date).order("priority", { ascending: true });
  await supabase.from("daily_plan_snapshots").insert({ workspace_id: workspaceId, snapshot_date: item.date, plan_version_id: item.plan_version_id, payload: { items: items ?? [] }, started_reason: reason });
}

async function ownedPlanItem(planItemId: string, workspaceId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_items")
    .select("id, workspace_id, subject, date")
    .eq("id", planItemId)
    .maybeSingle();
  if (!data || data.workspace_id !== workspaceId) return null;
  return data as { id: string; workspace_id: string; subject: string; date: string };
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
      note: parsed.data.note ?? null,
    };
  });

  await ensureDailySnapshot(workspace.id, item.id, "study_session");
  const { error } = await supabase.from("study_sessions").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/progress");
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
  await ensureDailySnapshot(workspace.id, item.id, "status_change");
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

export async function deleteSession(
  input: z.infer<typeof deleteSessionSchema>
): Promise<ActionResult> {
  const parsed = deleteSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("study_sessions")
    .delete()
    .eq("id", parsed.data.sessionId)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/history");
  return { ok: true };
}
