import { createServerSupabase } from "@/lib/supabase/server";
import { groupRowsByItem } from "@/lib/resources/resolve";
import type { StudyResource } from "@/lib/resources/types";
import type { StudyResourceRow } from "@/types/db";

export const STUDY_RESOURCE_COLUMNS = [
  "id",
  "workspace_id",
  "study_plan_item_id",
  "tier",
  "type",
  "provider",
  "title",
  "url",
  "course_code",
  "lesson_from",
  "lesson_to",
  "duration_minutes",
  "status",
  "access_type",
  "expires_at",
  "limited_watch_time",
  "listen_mode",
  "sort_order",
  "legacy_key",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

/**
 * `in(...)` travels in the query string, so a whole-plan export is split into
 * a few requests instead of one URL long enough to be rejected.
 */
const ID_BATCH_SIZE = 200;

/**
 * Load the resources of many plan items in one batched query (never one per
 * card). Returns an empty map for an empty id list so callers stay
 * unconditional.
 */
export async function getResourcesByPlanItem(
  workspaceId: string,
  planItemIds: string[]
): Promise<Map<string, StudyResource[]>> {
  if (planItemIds.length === 0) return new Map();

  const supabase = await createServerSupabase();
  const batches: string[][] = [];
  for (let i = 0; i < planItemIds.length; i += ID_BATCH_SIZE) {
    batches.push(planItemIds.slice(i, i + ID_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((ids) =>
      supabase
        .from("study_resources")
        .select(STUDY_RESOURCE_COLUMNS)
        .eq("workspace_id", workspaceId)
        .in("study_plan_item_id", ids)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    )
  );

  return groupRowsByItem(
    results.flatMap(
      ({ data }) => ((data as unknown) as StudyResourceRow[] | null) ?? []
    )
  );
}
