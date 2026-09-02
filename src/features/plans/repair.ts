import { createServerSupabase } from "@/lib/supabase/server";
import { PLAN_ITEM_COLUMNS } from "@/features/plans/data";
import {
  mergeItemMetadata,
  isSameLearningContent,
  resolveResourceFields,
} from "@/lib/plans/item-preservation";
import { resolveCanonicalResource } from "@/lib/plans/canonical-resources";
import { isValidResourceUrl } from "@/lib/plans/resource";
import type { PlanItem } from "@/types/db";

export type RepairStatus =
  | "restorable_safe"
  | "canonical_resolved"
  | "missing_at_source"
  | "conflict_blocked";

export interface RepairItemDetail {
  itemId: string;
  stableExternalId: string;
  subject: string;
  instructions: string;
  status: RepairStatus;
  restoredUrl: string | null;
  restoredLabel: string | null;
  reason: string;
}

export interface RepairSummary {
  ok: boolean;
  totalChecked: number;
  restorableSafely: number;
  canonicalResolvable: number;
  missingAtSource: number;
  conflictsBlocked: number;
  repairedCount: number;
  details: RepairItemDetail[];
  error?: string;
}

/**
 * Scan target items with missing `resource_url` and categorize them
 * based on semantic content match, canonical catalog, or conflicts.
 */
export async function scanPlanItemsForRepair(
  workspaceId: string,
  targetVersionId?: string
): Promise<{
  ok: boolean;
  targets: PlanItem[];
  donorMap: Map<string, PlanItem>;
  classifiedDetails: RepairItemDetail[];
  error?: string;
}> {
  const supabase = await createServerSupabase();

  // 1. Fetch donor items with resource_url != null
  const { data: donorRows, error: donorErr } = await supabase
    .from("study_plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .not("resource_url", "is", null);

  if (donorErr) {
    return { ok: false, targets: [], donorMap: new Map(), classifiedDetails: [], error: donorErr.message };
  }

  const donorMap = new Map<string, PlanItem>();
  for (const item of (donorRows as unknown as PlanItem[] | null) ?? []) {
    if (item.resource_url && !donorMap.has(item.stable_external_id)) {
      donorMap.set(item.stable_external_id, item);
    }
  }

  // 2. Query target items needing repair (resource_url is null)
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
    return { ok: false, targets: [], donorMap: new Map(), classifiedDetails: [], error: targetErr.message };
  }

  const targets = (targetRows as unknown as PlanItem[] | null) ?? [];
  const classifiedDetails: RepairItemDetail[] = [];

  for (const target of targets) {
    const instructions = target.instructions ?? "";

    // 1. Direct metadata check
    const metaUrl =
      typeof target.metadata?.videoUrl === "string" && isValidResourceUrl(target.metadata.videoUrl)
        ? target.metadata.videoUrl
        : typeof target.metadata?.resourceUrl === "string" && isValidResourceUrl(target.metadata.resourceUrl)
          ? target.metadata.resourceUrl
          : null;

    if (metaUrl) {
      classifiedDetails.push({
        itemId: target.id,
        stableExternalId: target.stable_external_id,
        subject: target.subject,
        instructions,
        status: "restorable_safe",
        restoredUrl: metaUrl,
        restoredLabel: target.resource_label ?? "เปิดลิงก์",
        reason: "มี URL อยู่ใน metadata ของ item เอง",
      });
      continue;
    }

    // 2. Canonical catalog check
    const canonical = resolveCanonicalResource(target);
    if (canonical) {
      classifiedDetails.push({
        itemId: target.id,
        stableExternalId: target.stable_external_id,
        subject: target.subject,
        instructions,
        status: "canonical_resolved",
        restoredUrl: canonical.url,
        restoredLabel: canonical.label,
        reason: `กำหนดจาก Canonical Resource Catalog (${canonical.label})`,
      });
      continue;
    }

    // 3. Check donor item from previous plan versions
    const donor = donorMap.get(target.stable_external_id);
    if (donor) {
      const sameContent = isSameLearningContent(target, donor);
      if (sameContent) {
        const { resourceUrl, resourceLabel } = resolveResourceFields(target, donor);
        if (resourceUrl) {
          classifiedDetails.push({
            itemId: target.id,
            stableExternalId: target.stable_external_id,
            subject: target.subject,
            instructions,
            status: "restorable_safe",
            restoredUrl: resourceUrl,
            restoredLabel: resourceLabel ?? donor.resource_label ?? "เปิดลิงก์",
            reason: "กู้คืนอย่างปลอดภัยจากเวอร์ชันก่อนหน้า (เนื้อหาและหัวข้อตรงกัน)",
          });
          continue;
        }
      } else {
        // Conflict / topic changed under same stable_external_id
        classifiedDetails.push({
          itemId: target.id,
          stableExternalId: target.stable_external_id,
          subject: target.subject,
          instructions,
          status: "conflict_blocked",
          restoredUrl: null,
          restoredLabel: null,
          reason: `หัวข้อเปลี่ยนจากเวอร์ชันเดิม (เดิม: "${donor.instructions?.slice(0, 35) ?? ""}" vs ปัจจุบัน: "${instructions.slice(0, 35)}") — ป้องกันการใส่คลิปผิดเนื้อหา`,
        });
        continue;
      }
    }

    // 4. Missing at source and no canonical mapping
    classifiedDetails.push({
      itemId: target.id,
      stableExternalId: target.stable_external_id,
      subject: target.subject,
      instructions,
      status: "missing_at_source",
      restoredUrl: null,
      restoredLabel: null,
      reason: "ไม่มี resourceUrl จากต้นทางและยังไม่มีการกำหนด canonical mapping",
    });
  }

  return {
    ok: true,
    targets,
    donorMap,
    classifiedDetails,
  };
}

/**
 * Preview missing resources breakdown without making database modifications.
 */
export async function previewPlanVersionResources(
  workspaceId: string,
  targetVersionId?: string
): Promise<RepairSummary> {
  const scan = await scanPlanItemsForRepair(workspaceId, targetVersionId);
  if (!scan.ok) {
    return {
      ok: false,
      totalChecked: 0,
      restorableSafely: 0,
      canonicalResolvable: 0,
      missingAtSource: 0,
      conflictsBlocked: 0,
      repairedCount: 0,
      details: [],
      error: scan.error,
    };
  }

  const restorableSafely = scan.classifiedDetails.filter((d) => d.status === "restorable_safe").length;
  const canonicalResolvable = scan.classifiedDetails.filter((d) => d.status === "canonical_resolved").length;
  const missingAtSource = scan.classifiedDetails.filter((d) => d.status === "missing_at_source").length;
  const conflictsBlocked = scan.classifiedDetails.filter((d) => d.status === "conflict_blocked").length;

  return {
    ok: true,
    totalChecked: scan.targets.length,
    restorableSafely,
    canonicalResolvable,
    missingAtSource,
    conflictsBlocked,
    repairedCount: 0,
    details: scan.classifiedDetails,
  };
}

/**
 * Safely backfill missing `resource_url` and `resource_label` on study plan items.
 *
 * Guarantees:
 * - Only updates items where `resource_url` is currently null.
 * - Only restores items that match semantic content identity or canonical catalog.
 * - Never overwrites an existing non-null `resource_url`.
 * - Merges `metadata` safely without replacing existing keys.
 * - Strictly rejects mismatched donor items (conflict_blocked).
 * - Does not touch `study_sessions`, `item_status_overrides`, or progress.
 */
export async function repairPlanVersionResources(
  workspaceId: string,
  targetVersionId?: string
): Promise<RepairSummary> {
  const scan = await scanPlanItemsForRepair(workspaceId, targetVersionId);
  if (!scan.ok) {
    return {
      ok: false,
      totalChecked: 0,
      restorableSafely: 0,
      canonicalResolvable: 0,
      missingAtSource: 0,
      conflictsBlocked: 0,
      repairedCount: 0,
      details: [],
      error: scan.error,
    };
  }

  const supabase = await createServerSupabase();
  const restorableItems = scan.classifiedDetails.filter(
    (d) => (d.status === "restorable_safe" || d.status === "canonical_resolved") && d.restoredUrl
  );

  const targetsById = new Map(scan.targets.map((t) => [t.id, t]));
  let repairedCount = 0;

  for (const detail of restorableItems) {
    const target = targetsById.get(detail.itemId);
    if (!target) continue;

    const donor = scan.donorMap.get(target.stable_external_id);
    const mergedMetadata = mergeItemMetadata(
      donor?.metadata,
      target.metadata
    );

    const { error: updateErr } = await supabase
      .from("study_plan_items")
      .update({
        resource_url: detail.restoredUrl,
        resource_label: detail.restoredLabel,
        metadata: mergedMetadata,
      })
      .eq("id", target.id)
      .eq("workspace_id", workspaceId)
      .is("resource_url", null); // double check concurrency

    if (!updateErr) {
      repairedCount++;
    }
  }

  const restorableSafely = scan.classifiedDetails.filter((d) => d.status === "restorable_safe").length;
  const canonicalResolvable = scan.classifiedDetails.filter((d) => d.status === "canonical_resolved").length;
  const missingAtSource = scan.classifiedDetails.filter((d) => d.status === "missing_at_source").length;
  const conflictsBlocked = scan.classifiedDetails.filter((d) => d.status === "conflict_blocked").length;

  return {
    ok: true,
    totalChecked: scan.targets.length,
    restorableSafely,
    canonicalResolvable,
    missingAtSource,
    conflictsBlocked,
    repairedCount,
    details: scan.classifiedDetails,
  };
}
