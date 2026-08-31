"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { dateString, timeString } from "@/lib/schemas/common";
import {
  validateIntervals,
  timeInTimezone,
  todayInTimezone,
  DEFAULT_TIMEZONE,
} from "@/lib/dates";
import { displayCustomSubject } from "@/lib/constants/exam-categories";
import type { ActionResult } from "@/features/sessions/actions";
import type { CustomStudyItem, StudySession } from "@/types/db";

function revalidateAllStudyViews() {
  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/plan");
  revalidatePath("/reviews");
  revalidatePath("/courses");
  revalidatePath("/assessments");
}

const customItemBaseSchema = {
  examCategory: z.string().min(1, "กรุณาเลือกหมวดสอบ"),
  subject: z.string().min(1, "กรุณาเลือกหรือระบุวิชา"),
  customSubject: z.string().max(100).optional().nullable(),
  title: z.string().min(1, "กรุณาระบุชื่อบทเรียน / สิ่งที่จะเรียน").max(200),
  url: z
    .string()
    .refine((val) => !val || val.trim() === "" || /^https?:\/\/.+/i.test(val), {
      message: "URL ต้องขึ้นต้นด้วย http:// หรือ https://",
    })
    .optional()
    .nullable(),
  estimatedMinutes: z
    .number()
    .int()
    .min(1, "เวลาเรียนต้องอย่างน้อย 1 นาที")
    .max(1440, "เวลาเรียนต้องไม่เกิน 1,440 นาที")
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
};

const createCustomStudySchema = z.object({
  studyDate: dateString,
  ...customItemBaseSchema,
});

export async function createCustomStudyItem(
  input: z.infer<typeof createCustomStudySchema>
): Promise<ActionResult & { id?: string }> {
  const parsed = createCustomStudySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
    };
  }

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const cleanUrl = parsed.data.url?.trim() ? parsed.data.url.trim() : null;
  const cleanCustomSubj = parsed.data.customSubject?.trim()
    ? parsed.data.customSubject.trim()
    : null;

  const { data, error } = await supabase
    .from("custom_study_items")
    .insert({
      workspace_id: workspace.id,
      study_date: parsed.data.studyDate,
      exam_category: parsed.data.examCategory,
      subject: parsed.data.subject,
      custom_subject: cleanCustomSubj,
      title: parsed.data.title.trim(),
      url: cleanUrl,
      estimated_minutes: parsed.data.estimatedMinutes ?? null,
      notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
      status: "not_started",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateAllStudyViews();
  return { ok: true, id: data.id, message: "เพิ่มการเรียนเองเรียบร้อยแล้ว" };
}

const updateCustomStudySchema = z.object({
  id: z.string().uuid(),
  ...customItemBaseSchema,
});

export async function updateCustomStudyItem(
  input: z.infer<typeof updateCustomStudySchema>
): Promise<ActionResult> {
  const parsed = updateCustomStudySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
    };
  }

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const cleanUrl = parsed.data.url?.trim() ? parsed.data.url.trim() : null;
  const cleanCustomSubj = parsed.data.customSubject?.trim()
    ? parsed.data.customSubject.trim()
    : null;

  const { error } = await supabase
    .from("custom_study_items")
    .update({
      exam_category: parsed.data.examCategory,
      subject: parsed.data.subject,
      custom_subject: cleanCustomSubj,
      title: parsed.data.title.trim(),
      url: cleanUrl,
      estimated_minutes: parsed.data.estimatedMinutes ?? null,
      notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) return { ok: false, error: error.message };

  revalidateAllStudyViews();
  return { ok: true, message: "แก้ไขการเรียนเองเรียบร้อยแล้ว" };
}

const deleteCustomStudySchema = z.object({
  id: z.string().uuid(),
});

export async function deleteCustomStudyItem(
  input: z.infer<typeof deleteCustomStudySchema>
): Promise<ActionResult> {
  const parsed = deleteCustomStudySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("custom_study_items")
    .delete()
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) return { ok: false, error: error.message };

  revalidateAllStudyViews();
  return { ok: true, message: "ลบรายการเรียบร้อยแล้ว" };
}

const setStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["not_started", "studying", "paused", "completed"]),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  sessionDate: dateString.optional(),
  note: z.string().max(500).optional(),
});

export async function setCustomStudyStatus(
  input: z.infer<typeof setStatusSchema>
): Promise<ActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();

  const { data: itemData, error: fetchErr } = await supabase
    .from("custom_study_items")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (fetchErr || !itemData) {
    return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };
  }
  const item = itemData as CustomStudyItem;

  // If transitioning from studying to paused/completed, record elapsed study session
  if (
    item.status === "studying" &&
    (parsed.data.status === "paused" || parsed.data.status === "completed")
  ) {
    const tz = workspace.timezone || DEFAULT_TIMEZONE;
    let duration = parsed.data.durationMinutes;
    let startTime = parsed.data.startTime;
    let endTime = parsed.data.endTime;
    const sessionDate = parsed.data.sessionDate ?? todayInTimezone(tz);

    if (duration === undefined) {
      const startDate = new Date(item.updated_at);
      const endDate = new Date();
      const diffMs = endDate.getTime() - startDate.getTime();
      duration = Math.floor(diffMs / 60000);
      startTime = startTime ?? timeInTimezone(tz, startDate);
      endTime = endTime ?? timeInTimezone(tz, endDate);
    }

    if (duration >= 1 && startTime && endTime) {
      const effectiveSubject = displayCustomSubject(
        item.subject,
        item.custom_subject
      );
      await supabase.from("study_sessions").insert({
        workspace_id: workspace.id,
        custom_study_item_id: item.id,
        plan_item_id: null,
        exam_category: item.exam_category,
        subject: effectiveSubject,
        activity_type: "custom_study",
        lesson_title: item.title,
        lesson_url: item.url,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: duration,
        status: "completed",
        note: parsed.data.note ?? null,
      });
    }
  }

  const { error } = await supabase
    .from("custom_study_items")
    .update({
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) return { ok: false, error: error.message };

  revalidateAllStudyViews();
  return { ok: true };
}

const addCustomStudyTimeSchema = z.object({
  customStudyItemId: z.string().uuid(),
  sessionDate: dateString,
  intervals: z
    .array(z.object({ start: timeString, end: timeString }))
    .min(1),
  note: z.string().max(500).optional(),
});

export async function addCustomStudyTime(
  input: z.infer<typeof addCustomStudyTimeSchema>
): Promise<ActionResult> {
  const parsed = addCustomStudyTimeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
    };
  }

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { data: itemData } = await supabase
    .from("custom_study_items")
    .select("*")
    .eq("id", parsed.data.customStudyItemId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const item = itemData as CustomStudyItem | null;
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

  // Validate intervals
  const { data: existing } = await supabase
    .from("study_sessions")
    .select("start_time, end_time")
    .eq("custom_study_item_id", item.id)
    .eq("session_date", parsed.data.sessionDate);

  const existingIntervals = (
    (existing as Array<{ start_time: string | null; end_time: string | null }> | null) ?? []
  )
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({ start: s.start_time as string, end: s.end_time as string }));

  const validation = validateIntervals([
    ...existingIntervals,
    ...parsed.data.intervals,
  ]);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join("; ") };
  }

  const effectiveSubject = displayCustomSubject(item.subject, item.custom_subject);

  const rows = parsed.data.intervals.map((iv) => {
    const single = validateIntervals([iv]);
    return {
      workspace_id: workspace.id,
      custom_study_item_id: item.id,
      plan_item_id: null,
      exam_category: item.exam_category,
      subject: effectiveSubject,
      activity_type: "custom_study",
      lesson_title: item.title,
      lesson_url: item.url,
      session_date: parsed.data.sessionDate,
      start_time: iv.start,
      end_time: iv.end,
      duration_minutes: single.totalMinutes,
      status: "completed",
      note: parsed.data.note ?? null,
    };
  });

  const { error } = await supabase.from("study_sessions").insert(rows);
  if (error) return { ok: false, error: error.message };

  // Check total minutes and update status if completed
  const { data: allSessions } = await supabase
    .from("study_sessions")
    .select("duration_minutes")
    .eq("custom_study_item_id", item.id);

  const totalMin = (
    (allSessions as Array<{ duration_minutes: number }> | null) ?? []
  ).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

  if (item.estimated_minutes && totalMin >= item.estimated_minutes) {
    await supabase
      .from("custom_study_items")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", item.id);
  } else if (item.status === "not_started") {
    await supabase
      .from("custom_study_items")
      .update({ status: "studying", updated_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  revalidateAllStudyViews();
  return { ok: true, message: `บันทึกเวลา ${validation.totalMinutes} นาทีแล้ว` };
}
