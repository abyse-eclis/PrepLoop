"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { dateString } from "@/lib/schemas/common";
import type { ActionResult } from "@/features/sessions/actions";
import type { CustomStudyItem } from "@/types/db";

// Time logging and status changes for custom items live in the unified
// study-session actions (features/today/session-actions.ts) so paid-course and
// free-course cards share one code path.

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
): Promise<ActionResult & { id?: string; item?: CustomStudyItem }> {
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
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  const item = data as CustomStudyItem;
  return { ok: true, id: item.id, item, message: "เพิ่มการเรียนเองเรียบร้อยแล้ว" };
}

const updateCustomStudySchema = z.object({
  id: z.string().uuid(),
  ...customItemBaseSchema,
});

export async function updateCustomStudyItem(
  input: z.infer<typeof updateCustomStudySchema>
): Promise<ActionResult & { item?: CustomStudyItem }> {
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

  const { data, error } = await supabase
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
    .eq("workspace_id", workspace.id)
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    item: (data as CustomStudyItem | null) ?? undefined,
    message: "แก้ไขการเรียนเองเรียบร้อยแล้ว",
  };
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

  // History/progress pages are dynamic and re-fetch on navigation; the Today
  // page removes the card from its own state.
  return { ok: true, message: "ลบรายการเรียบร้อยแล้ว" };
}
