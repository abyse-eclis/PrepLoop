"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { addDays, todayInTimezone } from "@/lib/dates";
import { assertPlanVersionImmutable } from "@/lib/plans/immutable";
import type { PlanVersion } from "@/types/db";

export interface PlanActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const activateSchema = z.object({
  versionId: z.string().uuid(),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Activate a draft plan version. Immutable-safe:
 *  - Only a draft can be activated.
 *  - The previously active version is superseded (never edited content) and its
 *    effective_to is set to the day before the new effective_from, so past dates
 *    keep referencing the old version.
 */
export async function activatePlanVersion(
  input: z.infer<typeof activateSchema>
): Promise<PlanActionResult> {
  const parsed = activateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };

  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { data: versionRow } = await supabase
    .from("study_plan_versions")
    .select("*")
    .eq("id", parsed.data.versionId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const version = versionRow as PlanVersion | null;
  if (!version) return { ok: false, error: "ไม่พบเวอร์ชัน" };

  try {
    assertPlanVersionImmutable(version.status);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const today = todayInTimezone(workspace.timezone);
  const effectiveFrom =
    parsed.data.effectiveFrom ??
    (version.start_date > today ? version.start_date : today);

  // Supersede current active version(s).
  const { data: actives } = await supabase
    .from("study_plan_versions")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("status", "active");

  for (const a of (actives as PlanVersion[] | null) ?? []) {
    await supabase
      .from("study_plan_versions")
      .update({
        status: "superseded",
        effective_to: addDays(effectiveFrom, -1),
      })
      .eq("id", a.id);
  }

  const { error } = await supabase
    .from("study_plan_versions")
    .update({
      status: "active",
      effective_from: effectiveFrom,
      effective_to: null,
      activated_at: new Date().toISOString(),
    })
    .eq("id", version.id);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("workspaces")
    .update({ active_plan_version_id: version.id })
    .eq("id", workspace.id);

  revalidatePath("/plan");
  revalidatePath("/today");
  return {
    ok: true,
    message: `เปิดใช้งานแผน v${version.version_number} ตั้งแต่ ${effectiveFrom}`,
  };
}

const archiveSchema = z.object({ versionId: z.string().uuid() });

export async function archivePlanVersion(
  input: z.infer<typeof archiveSchema>
): Promise<PlanActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("study_plan_versions")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", parsed.data.versionId)
    .eq("workspace_id", workspace.id)
    .eq("status", "draft"); // only drafts can be archived away safely
  if (error) return { ok: false, error: error.message };

  revalidatePath("/plan");
  return { ok: true, message: "เก็บถาวรฉบับร่างแล้ว" };
}
