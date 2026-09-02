import { createServerSupabase } from "@/lib/supabase/server";
import { PLAN_ITEM_COLUMNS } from "@/features/plans/data";
import { mergeItemMetadata, resolveResourceFields } from "@/lib/plans/item-preservation";
import type { PlanItem } from "@/types/db";

export interface RepairResult {
  ok: boolean;
  repairedCount: number;
  totalChecked: number;
  details: Array<{
    itemId: string;
    stableExternalId: string;
    subject: string;
    restoredUrl: string;
    restoredLabel: string | null;
  }>;
  error?: string;
}

/**
 * Safely backfill missing `resource_url` and `resource_label` on study plan items
 * from prior plan versions in the same workspace with matching `stable_external_id`.
 *
 * Guarantees:
 * - Only updates items where `resource_url` is currently null.
 * - Never overwrites an existing non-null `resource_url`.
 * - Merges `metadata` safely without replacing existing keys.
 * - Does not touch `study_sessions`, `item_status_overrides`, or progress.
 */
export async function repairPlanVersionResources(
  workspaceId: string,
  targetVersionId?: string
): Promise<RepairResult> {
  const supabase = await createServerSupabase();

  // 1. Fetch all items in the workspace with resource_url != null to build reference map
  const { data: donorRows, error: donorErr } = await supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .not("resource_url", "is", null);

  if (donorErr) {
    return { ok: false, repairedCount: 0, totalChecked: 0, details: [], error: donorErr.message };
  }

  const donorMap = new Map<string, PlanItem>();
  for (const item of (donorRows as unknown as PlanItem[] | null) ?? []) {
    if (item.resource_url && !donorMap.has(item.stable_external_id)) {
      donorMap.set(item.stable_external_id, item);
    }
  }

  // 2. Query target items needing repair
  let targetQuery = supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("resource_url", null);

  if (targetVersionId) {
    targetQuery = targetQuery.eq("plan_version_id", targetVersionId);
  }

  const { data: targetRows, error: targetErr } = await targetQuery;
  if (targetErr) {
    return { ok: false, repairedCount: 0, totalChecked: 0, details: [], error: targetErr.message };
  }

  const targets = (targetRows as unknown as PlanItem[] | null) ?? [];
  const details: RepairResult["details"] = [];
  let repairedCount = 0;

  for (const target of targets) {
    const donor = donorMap.get(target.stable_external_id);
    if (!donor) continue;

    const { resourceUrl, resourceLabel } = resolveResourceFields(target, donor);
    if (!resourceUrl) continue;

    const mergedMetadata = mergeItemMetadata(donor.metadata, target.metadata);

    const { error: updateErr } = await supabase
      .from("study_plan_items")
      .update({
        resource_url: resourceUrl,
        resource_label: resourceLabel,
        metadata: mergedMetadata,
      })
      .eq("id", target.id)
      .eq("workspace_id", workspaceId);

    if (!updateErr) {
      repairedCount++;
      details.push({
        itemId: target.id,
        stableExternalId: target.stable_external_id,
        subject: target.subject,
        restoredUrl: resourceUrl,
        restoredLabel: resourceLabel,
      });
    }
  }

  return {
    ok: true,
    repairedCount,
    totalChecked: targets.length,
    details,
  };
}
