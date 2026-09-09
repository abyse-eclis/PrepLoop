"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { dateString, timeString } from "@/lib/schemas/common";
import { validateIntervals } from "@/lib/dates";
import { displayCustomSubject } from "@/lib/constants/exam-categories";
import {
  ensureDailySnapshot,
  ownedPlanItem,
  siblingPlanItemIds,
  type OwnedPlanItem,
} from "@/features/sessions/plan-item-db";
import {
  customStatusAfterAddingTime,
  customStatusForAction,
  planStatusAfterAddingTime,
  planStatusForAction,
  progressPercent,
  toHistoryEntry,
  toSessionStatus,
  type SessionHistoryEntry,
  type SessionPatch,
  type SessionSource,
  type SessionStatus,
} from "@/lib/study-session";
import type { CustomStudyItem, ItemStatusOverride, StudySession } from "@/types/db";

/**
 * Unified server actions for a Study Session card. One code path serves both
 * sources; only the table written differs. None of these revalidate the Today
 * route: the client applies the change optimistically and reconciles with the
 * returned `patch`, so a successful mutation never re-renders the whole page.
 * Other routes are dynamic and always re-fetch on navigation.
 */

export interface SessionActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** Server truth for the mutated session, to merge over the optimistic state. */
  patch?: SessionPatch;
}

const sourceSchema = z.object({
  kind: z.enum(["plan", "custom"]),
  id: z.string().uuid(),
});

type SessionRow = Pick<
  StudySession,
  "id" | "session_date" | "start_time" | "end_time" | "duration_minutes" | "note"
>;

const SESSION_ROW_COLUMNS = "id, session_date, start_time, end_time, duration_minutes, note";

function sumMinutes(rows: Array<{ duration_minutes: number }>): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.duration_minutes ?? 0), 0);
}

function toEntries(rows: SessionRow[]): SessionHistoryEntry[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        a.session_date.localeCompare(b.session_date) ||
        (a.start_time ?? "").localeCompare(b.start_time ?? "")
    )
    .map((r) => toHistoryEntry({ ...r, workspace_id: "", plan_item_id: null } as StudySession));
}

function intervalsOf(rows: Array<{ start_time: string | null; end_time: string | null }>) {
  return rows
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({ start: s.start_time as string, end: s.end_time as string }));
}

// ---------------------------------------------------------------------------
// เพิ่มเวลา
// ---------------------------------------------------------------------------

const addTimeSchema = z.object({
  source: sourceSchema,
  sessionDate: dateString,
  intervals: z.array(z.object({ start: timeString, end: timeString })).min(1),
  note: z.string().max(500).optional(),
});

export async function addSessionTime(
  input: z.infer<typeof addTimeSchema>
): Promise<SessionActionResult> {
  const parsed = addTimeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const { source, sessionDate, intervals, note } = parsed.data;
  return source.kind === "plan"
    ? addPlanTime(workspace.id, source.id, sessionDate, intervals, note)
    : addCustomTime(workspace.id, source.id, sessionDate, intervals, note);
}

async function addPlanTime(
  workspaceId: string,
  planItemId: string,
  sessionDate: string,
  intervals: Array<{ start: string; end: string }>,
  note: string | undefined
): Promise<SessionActionResult> {
  const item = await ownedPlanItem(planItemId, workspaceId);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

  const supabase = await createServerSupabase();
  const [siblingIds, overrideRes] = await Promise.all([
    siblingPlanItemIds(workspaceId, item),
    supabase
      .from("item_status_overrides")
      .select("status, completed_at")
      .eq("workspace_id", workspaceId)
      .eq("plan_item_id", item.id)
      .maybeSingle(),
    ensureDailySnapshot(workspaceId, item, "study_session"),
  ]);

  const { data: existingRows } = await supabase
    .from("study_sessions")
    .select(SESSION_ROW_COLUMNS)
    .eq("workspace_id", workspaceId)
    .in("plan_item_id", siblingIds);
  const existing = (existingRows as SessionRow[] | null) ?? [];

  const validation = validateIntervals([
    ...intervalsOf(existing.filter((s) => s.session_date === sessionDate)),
    ...intervals,
  ]);
  if (!validation.ok) return { ok: false, error: validation.errors.join("; ") };

  const rows = intervals.map((iv) => ({
    workspace_id: workspaceId,
    plan_item_id: item.id,
    source_activity_id: item.stable_external_id ?? null,
    subject: item.subject,
    session_date: sessionDate,
    start_time: iv.start,
    end_time: iv.end,
    duration_minutes: validateIntervals([iv]).totalMinutes,
    status: "completed",
    actual_lesson_from: item.lesson_from,
    actual_lesson_to: item.lesson_to,
    note: note ?? null,
  }));

  const { data: insertedRows, error } = await supabase
    .from("study_sessions")
    .insert(rows)
    .select(SESSION_ROW_COLUMNS);
  if (error) return { ok: false, error: error.message };
  const inserted = (insertedRows as SessionRow[] | null) ?? [];

  const allRows = [...existing, ...inserted];
  const actualMinutes = sumMinutes(allRows);
  const override = overrideRes.data as Pick<ItemStatusOverride, "status" | "completed_at"> | null;
  const currentStatus: SessionStatus = toSessionStatus(
    override?.status,
    sumMinutes(existing)
  );
  const nextRaw = planStatusAfterAddingTime(currentStatus, actualMinutes, item.target_minutes);
  const now = new Date().toISOString();
  const completedAt =
    nextRaw === "completed" ? (override?.completed_at ?? now) : null;

  const { error: upsertError } = await supabase.from("item_status_overrides").upsert(
    {
      workspace_id: workspaceId,
      plan_item_id: item.id,
      status: nextRaw,
      actual_lesson_from: item.lesson_from,
      actual_lesson_to: item.lesson_to,
      completed_at: completedAt,
      deferred_at: null,
      deferred_from_date: null,
    },
    { onConflict: "plan_item_id" }
  );
  if (upsertError) return { ok: false, error: upsertError.message };

  return {
    ok: true,
    message: `บันทึกเวลา ${validation.totalMinutes} นาทีแล้ว`,
    patch: {
      actualMinutes,
      progressPercent: progressPercent(actualMinutes, item.target_minutes),
      status: toSessionStatus(nextRaw, actualMinutes),
      rawStatus: nextRaw,
      history: toEntries(allRows),
      completedAt,
      deferredAt: null,
    },
  };
}

async function ownedCustomItem(
  workspaceId: string,
  id: string
): Promise<CustomStudyItem | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("custom_study_items")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data as CustomStudyItem | null) ?? null;
}

async function addCustomTime(
  workspaceId: string,
  itemId: string,
  sessionDate: string,
  intervals: Array<{ start: string; end: string }>,
  note: string | undefined
): Promise<SessionActionResult> {
  const supabase = await createServerSupabase();
  const [item, existingRes] = await Promise.all([
    ownedCustomItem(workspaceId, itemId),
    supabase
      .from("study_sessions")
      .select(SESSION_ROW_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("custom_study_item_id", itemId),
  ]);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };
  const existing = (existingRes.data as SessionRow[] | null) ?? [];

  const validation = validateIntervals([
    ...intervalsOf(existing.filter((s) => s.session_date === sessionDate)),
    ...intervals,
  ]);
  if (!validation.ok) return { ok: false, error: validation.errors.join("; ") };

  const effectiveSubject = displayCustomSubject(item.subject, item.custom_subject);
  const rows = intervals.map((iv) => ({
    workspace_id: workspaceId,
    custom_study_item_id: item.id,
    plan_item_id: null,
    exam_category: item.exam_category,
    subject: effectiveSubject,
    activity_type: "custom_study",
    lesson_title: item.title,
    lesson_url: item.url,
    session_date: sessionDate,
    start_time: iv.start,
    end_time: iv.end,
    duration_minutes: validateIntervals([iv]).totalMinutes,
    status: "completed",
    note: note ?? null,
  }));

  const { data: insertedRows, error } = await supabase
    .from("study_sessions")
    .insert(rows)
    .select(SESSION_ROW_COLUMNS);
  if (error) return { ok: false, error: error.message };
  const inserted = (insertedRows as SessionRow[] | null) ?? [];

  const allRows = [...existing, ...inserted];
  const actualMinutes = sumMinutes(allRows);
  const planned = item.estimated_minutes ?? 0;
  const currentStatus = toSessionStatus(item.status, sumMinutes(existing));
  const nextRaw = customStatusAfterAddingTime(currentStatus, actualMinutes, planned);
  const now = new Date().toISOString();
  const completedAt = nextRaw === "completed" ? (item.completed_at ?? now) : null;

  const { error: updateError } = await supabase
    .from("custom_study_items")
    .update({
      status: nextRaw,
      completed_at: completedAt,
      deferred_at: null,
      deferred_from_date: null,
      updated_at: now,
    })
    .eq("id", item.id)
    .eq("workspace_id", workspaceId);
  if (updateError) return { ok: false, error: updateError.message };

  return {
    ok: true,
    message: `บันทึกเวลา ${validation.totalMinutes} นาทีแล้ว`,
    patch: {
      actualMinutes,
      progressPercent: progressPercent(actualMinutes, planned),
      status: toSessionStatus(nextRaw, actualMinutes),
      rawStatus: nextRaw,
      history: toEntries(allRows),
      completedAt,
      deferredAt: null,
    },
  };
}

// ---------------------------------------------------------------------------
// เรียนเสร็จ / ถัดไป / ข้าม / ยกเลิก
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  source: sourceSchema,
  action: z.enum(["completed", "pending", "deferred", "skipped"]),
  /** The study date the action was taken on (deferred_from_date). */
  date: dateString,
});

export async function setSessionStatus(
  input: z.infer<typeof statusSchema>
): Promise<SessionActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const { source, action, date } = parsed.data;
  const now = new Date().toISOString();
  const supabase = await createServerSupabase();

  if (source.kind === "plan") {
    const item = await ownedPlanItem(source.id, workspace.id);
    if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

    const [siblingIds, overrideRes] = await Promise.all([
      siblingPlanItemIds(workspace.id, item),
      supabase
        .from("item_status_overrides")
        .select("completed_at")
        .eq("workspace_id", workspace.id)
        .eq("plan_item_id", item.id)
        .maybeSingle(),
      ensureDailySnapshot(workspace.id, item, "status_change"),
    ]);
    const { data: sessionRows } = await supabase
      .from("study_sessions")
      .select("duration_minutes")
      .eq("workspace_id", workspace.id)
      .in("plan_item_id", siblingIds);
    const actualMinutes = sumMinutes((sessionRows as Array<{ duration_minutes: number }> | null) ?? []);

    const nextRaw = resolvePlanStatus(action, actualMinutes);
    const previous = overrideRes.data as { completed_at: string | null } | null;
    const completedAt = action === "completed" ? (previous?.completed_at ?? now) : null;

    const { error } = await supabase.from("item_status_overrides").upsert(
      {
        workspace_id: workspace.id,
        plan_item_id: item.id,
        status: nextRaw,
        actual_lesson_from: item.lesson_from,
        actual_lesson_to: item.lesson_to,
        completed_at: completedAt,
        deferred_at: action === "deferred" ? now : null,
        deferred_from_date: action === "deferred" ? date : null,
      },
      { onConflict: "plan_item_id" }
    );
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      patch: {
        status: toSessionStatus(nextRaw, actualMinutes),
        rawStatus: nextRaw,
        completedAt,
        deferredAt: action === "deferred" ? now : null,
        progressPercent: progressPercent(actualMinutes, item.target_minutes),
      },
    };
  }

  const item = await ownedCustomItem(workspace.id, source.id);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };
  const { data: sessionRows } = await supabase
    .from("study_sessions")
    .select("duration_minutes")
    .eq("workspace_id", workspace.id)
    .eq("custom_study_item_id", item.id);
  const actualMinutes = sumMinutes((sessionRows as Array<{ duration_minutes: number }> | null) ?? []);
  const nextRaw = resolveCustomStatus(action, actualMinutes);
  const completedAt = action === "completed" ? (item.completed_at ?? now) : null;

  const { error } = await supabase
    .from("custom_study_items")
    .update({
      status: nextRaw,
      completed_at: completedAt,
      deferred_at: action === "deferred" ? now : null,
      deferred_from_date: action === "deferred" ? date : null,
      updated_at: now,
    })
    .eq("id", item.id)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    patch: {
      status: toSessionStatus(nextRaw, actualMinutes),
      rawStatus: nextRaw,
      completedAt,
      deferredAt: action === "deferred" ? now : null,
      progressPercent: progressPercent(actualMinutes, item.estimated_minutes ?? 0),
    },
  };
}

function resolvePlanStatus(action: "completed" | "pending" | "deferred" | "skipped", actualMinutes: number) {
  if (action === "pending") return actualMinutes > 0 ? "studying" : "not_started";
  return planStatusForAction(action);
}

function resolveCustomStatus(action: "completed" | "pending" | "deferred" | "skipped", actualMinutes: number) {
  if (action === "pending") return actualMinutes > 0 ? "studying" : "not_started";
  return customStatusForAction(action);
}

// ---------------------------------------------------------------------------
// หมายเหตุ
// ---------------------------------------------------------------------------

const notesSchema = z.object({
  source: sourceSchema,
  notes: z.string().max(500),
});

export async function setSessionNotes(
  input: z.infer<typeof notesSchema>
): Promise<SessionActionResult> {
  const parsed = notesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "หมายเหตุยาวเกิน 500 ตัวอักษร" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const notes = parsed.data.notes.trim() ? parsed.data.notes.trim() : null;
  const supabase = await createServerSupabase();
  const { source } = parsed.data;

  if (source.kind === "custom") {
    const { error } = await supabase
      .from("custom_study_items")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("id", source.id)
      .eq("workspace_id", workspace.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, patch: { notes } };
  }

  const item = await ownedPlanItem(source.id, workspace.id);
  if (!item) return { ok: false, error: "ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง" };

  const { data: existing } = await supabase
    .from("item_status_overrides")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("plan_item_id", item.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("item_status_overrides")
      .update({ notes })
      .eq("id", (existing as { id: string }).id)
      .eq("workspace_id", workspace.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, patch: { notes } };
  }

  // First override for this item: keep its derived status intact.
  const status = await derivedPlanStatus(workspace.id, item);
  const { error } = await supabase.from("item_status_overrides").insert({
    workspace_id: workspace.id,
    plan_item_id: item.id,
    status,
    actual_lesson_from: item.lesson_from,
    actual_lesson_to: item.lesson_to,
    notes,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, patch: { notes } };
}

async function derivedPlanStatus(workspaceId: string, item: OwnedPlanItem) {
  const supabase = await createServerSupabase();
  const siblingIds = await siblingPlanItemIds(workspaceId, item);
  const { data } = await supabase
    .from("study_sessions")
    .select("duration_minutes")
    .eq("workspace_id", workspaceId)
    .in("plan_item_id", siblingIds);
  const actual = sumMinutes((data as Array<{ duration_minutes: number }> | null) ?? []);
  if (actual <= 0) return "not_started";
  return item.target_minutes > 0 && actual >= item.target_minutes ? "completed" : "studying";
}

export type { SessionSource };
