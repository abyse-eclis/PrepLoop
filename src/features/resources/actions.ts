"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { studyResourceSchema } from "@/lib/schemas/study-resource";
import { deriveLegacyResources } from "@/lib/resources/legacy";
import { toStudyResource } from "@/lib/resources/resolve";
import { RESOURCE_STATUSES } from "@/lib/resources/types";
import type { StudyResource } from "@/lib/resources/types";
import type { ActionResult } from "@/features/sessions/actions";
import type { ItemStatusOverride, PlanItem, StudyResourceRow } from "@/types/db";

const LEGACY_ITEM_COLUMNS =
  "id, workspace_id, subject, topic, instructions, course_code, lesson_from, lesson_to, activity_type, resource_url, resource_label, metadata";

type LegacyItemFields = Pick<
  PlanItem,
  | "id"
  | "workspace_id"
  | "subject"
  | "topic"
  | "instructions"
  | "course_code"
  | "lesson_from"
  | "lesson_to"
  | "activity_type"
  | "resource_url"
  | "resource_label"
  | "metadata"
>;

const resourceStatusEnum = z.enum(RESOURCE_STATUSES);

function revalidateResourceViews() {
  revalidatePath("/today");
  revalidatePath("/plan");
}

/** Fetch a plan item the caller owns, or null. */
async function ownedPlanItem(
  planItemId: string,
  workspaceId: string
): Promise<LegacyItemFields | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_plan_items")
    .select(LEGACY_ITEM_COLUMNS)
    .eq("id", planItemId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return ((data as unknown) as LegacyItemFields | null) ?? null;
}

async function nextSortOrder(
  workspaceId: string,
  planItemId: string
): Promise<number> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("study_resources")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .eq("study_plan_item_id", planItemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const current = (data as { sort_order: number } | null)?.sort_order;
  return typeof current === "number" ? current + 1 : 0;
}

type ResourceRowInput = Omit<StudyResource, "id" | "planItemId" | "isLegacy">;

function toRow(
  workspaceId: string,
  planItemId: string,
  resource: ResourceRowInput
) {
  return {
    workspace_id: workspaceId,
    study_plan_item_id: planItemId,
    tier: resource.tier,
    type: resource.type,
    provider: resource.provider,
    title: resource.title,
    url: resource.url,
    course_code: resource.courseCode,
    lesson_from: resource.lessonFrom,
    lesson_to: resource.lessonTo,
    duration_minutes: resource.durationMinutes,
    status: resource.status,
    access_type: resource.accessType,
    expires_at: resource.expiresAt,
    limited_watch_time: resource.limitedWatchTime,
    listen_mode: resource.listenMode,
    sort_order: resource.sortOrder,
    legacy_key: resource.legacyKey,
    metadata: resource.metadata,
  };
}

/**
 * Write an item's legacy (virtual) resources into `study_resources` so they can
 * carry their own status. All of them are materialised together — otherwise the
 * item would lose the cards that were never touched.
 *
 * Only the missing ones are inserted: a resource that already has a row keeps
 * the status the user gave it.
 */
async function materializeLegacyResources(
  workspaceId: string,
  planItemId: string
): Promise<{ ok: boolean; resources: StudyResource[]; error?: string }> {
  const item = await ownedPlanItem(planItemId, workspaceId);
  if (!item) return { ok: false, resources: [], error: "ไม่พบรายการเรียน" };

  const supabase = await createServerSupabase();
  const readRows = () =>
    supabase
      .from("study_resources")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("study_plan_item_id", planItemId)
      .order("sort_order", { ascending: true });

  const [{ data: existingRows }, { data: overrideRow }] = await Promise.all([
    readRows(),
    supabase
      .from("item_status_overrides")
      .select("status")
      .eq("workspace_id", workspaceId)
      .eq("plan_item_id", planItemId)
      .maybeSingle(),
  ]);

  const existing = (((existingRows as unknown) as StudyResourceRow[] | null) ?? [])
    .map(toStudyResource);
  const legacy = deriveLegacyResources(
    item,
    (overrideRow as Pick<ItemStatusOverride, "status"> | null)?.status
  );

  const existingKeys = new Set(
    existing.map((resource) => resource.legacyKey).filter(Boolean)
  );
  const missing = legacy.filter(
    (resource) => resource.legacyKey && !existingKeys.has(resource.legacyKey)
  );
  if (missing.length === 0) return { ok: true, resources: existing };

  const maxSortOrder = existing.reduce(
    (max, resource) => Math.max(max, resource.sortOrder),
    -1
  );
  const { error } = await supabase.from("study_resources").upsert(
    missing.map((resource, index) =>
      toRow(workspaceId, planItemId, {
        ...resource,
        sortOrder: maxSortOrder + 1 + index,
      })
    ),
    // DO NOTHING on conflict: a concurrent materialisation must never reset a
    // status the user already set.
    { onConflict: "study_plan_item_id,legacy_key", ignoreDuplicates: true }
  );
  if (error) return { ok: false, resources: [], error: error.message };

  const { data: allRows } = await readRows();
  return {
    ok: true,
    resources: (((allRows as unknown) as StudyResourceRow[] | null) ?? []).map(
      toStudyResource
    ),
  };
}

const setStatusSchema = z.object({
  planItemId: z.string().uuid(),
  resourceId: z.string().min(1),
  status: resourceStatusEnum,
});

/**
 * Change one resource's status.
 *
 * Only that resource moves: the plan item's own status, its sessions and the
 * review system are untouched. Marking a clip "ฟังผ่านแล้ว" (played in the
 * background while working) must never complete the topic.
 */
export async function setStudyResourceStatus(
  input: z.infer<typeof setStatusSchema>
): Promise<ActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
    };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { planItemId, resourceId, status } = parsed.data;

  let targetId = resourceId;
  if (resourceId.startsWith("legacy:")) {
    const materialized = await materializeLegacyResources(
      workspace.id,
      planItemId
    );
    if (!materialized.ok) {
      return { ok: false, error: materialized.error ?? "บันทึกไม่สำเร็จ" };
    }
    const legacyKey = resourceId.split(":").slice(0, 2).join(":");
    const match = materialized.resources.find((r) => r.legacyKey === legacyKey);
    if (!match) return { ok: false, error: "ไม่พบแหล่งเรียนนี้" };
    targetId = match.id;
  }

  const { error } = await supabase
    .from("study_resources")
    .update({ status })
    .eq("id", targetId)
    .eq("workspace_id", workspace.id)
    .eq("study_plan_item_id", planItemId);

  if (error) return { ok: false, error: error.message };

  revalidateResourceViews();
  return { ok: true, message: "อัปเดตสถานะแหล่งเรียนแล้ว" };
}

const createSchema = studyResourceSchema
  .omit({ id: true })
  .extend({ planItemId: z.string().uuid() });

export async function createStudyResource(
  input: z.infer<typeof createSchema>
): Promise<ActionResult & { id?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
    };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const { planItemId, ...resource } = parsed.data;
  const item = await ownedPlanItem(planItemId, workspace.id);
  if (!item) return { ok: false, error: "ไม่พบรายการเรียน" };

  // A hand-added resource turns the item's legacy links into real rows too, so
  // both keep showing side by side instead of one replacing the other.
  const materialized = await materializeLegacyResources(
    workspace.id,
    planItemId
  );
  if (!materialized.ok) {
    return { ok: false, error: materialized.error ?? "บันทึกไม่สำเร็จ" };
  }

  const sortOrder =
    resource.sortOrder ?? (await nextSortOrder(workspace.id, planItemId));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("study_resources")
    .insert(
      toRow(workspace.id, planItemId, {
        tier: resource.tier,
        type: resource.type,
        provider: resource.provider ?? null,
        title: resource.title,
        url: resource.url ?? null,
        courseCode: resource.courseCode ?? null,
        lessonFrom: resource.lessonFrom ?? null,
        lessonTo: resource.lessonTo ?? null,
        durationMinutes: resource.durationMinutes ?? null,
        status: resource.status,
        accessType: resource.accessType ?? null,
        expiresAt: resource.expiresAt ?? null,
        limitedWatchTime: resource.limitedWatchTime,
        listenMode: resource.listenMode,
        sortOrder,
        metadata: resource.metadata ?? null,
        legacyKey: null,
      })
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateResourceViews();
  return {
    ok: true,
    id: (data as { id: string }).id,
    message: "เพิ่มแหล่งเรียนแล้ว",
  };
}

const updateSchema = studyResourceSchema.omit({ id: true }).extend({
  id: z.string().uuid(),
  planItemId: z.string().uuid(),
});

export async function updateStudyResource(
  input: z.infer<typeof updateSchema>
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
    };
  }
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const { id, planItemId, sortOrder, ...resource } = parsed.data;
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("study_resources")
    .update({
      tier: resource.tier,
      type: resource.type,
      provider: resource.provider ?? null,
      title: resource.title,
      url: resource.url ?? null,
      course_code: resource.courseCode ?? null,
      lesson_from: resource.lessonFrom ?? null,
      lesson_to: resource.lessonTo ?? null,
      duration_minutes: resource.durationMinutes ?? null,
      status: resource.status,
      access_type: resource.accessType ?? null,
      expires_at: resource.expiresAt ?? null,
      limited_watch_time: resource.limitedWatchTime,
      listen_mode: resource.listenMode,
      ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
      metadata: resource.metadata ?? null,
    })
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .eq("study_plan_item_id", planItemId);

  if (error) return { ok: false, error: error.message };

  revalidateResourceViews();
  return { ok: true, message: "บันทึกแหล่งเรียนแล้ว" };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteStudyResource(
  input: z.infer<typeof deleteSchema>
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("study_resources")
    .delete()
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) return { ok: false, error: error.message };

  revalidateResourceViews();
  return { ok: true, message: "ลบแหล่งเรียนแล้ว" };
}
