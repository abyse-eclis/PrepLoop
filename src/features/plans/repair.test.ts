import { describe, expect, it } from "vitest";
import { resolveResourceFields, mergeItemMetadata } from "@/lib/plans/item-preservation";
import type { PlanItem } from "@/types/db";

describe("plan resource repair logic", () => {
  it("matches target item with donor item and restores resource fields safely", () => {
    const donor: PlanItem = {
      id: "item-v20",
      workspace_id: "ws-1",
      plan_version_id: "v-20",
      plan_day_id: "day-v20",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "2026-09-02-alevel-english",
      subject: "A_LEVEL_ENGLISH",
      course_code: "ENG101",
      lesson_from: "001",
      lesson_to: "002",
      activity_type: "course",
      assessment_source_id: null,
      target_minutes: 60,
      priority: "high",
      instructions: "5 โครงสร้างประโยคพื้นฐาน",
      resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
      resource_label: "5 โครงสร้างประโยคพื้นฐาน",
      review_reference_ids: [],
      metadata: { originalSource: "v7.1" },
      created_at: "2026-09-02T00:00:00Z",
    };

    const targetWithoutResource: PlanItem = {
      id: "item-v21",
      workspace_id: "ws-1",
      plan_version_id: "v-21",
      plan_day_id: "day-v21",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "2026-09-02-alevel-english",
      subject: "A_LEVEL_ENGLISH",
      course_code: "ENG101",
      lesson_from: "001",
      lesson_to: "002",
      activity_type: "course",
      assessment_source_id: null,
      target_minutes: 60,
      priority: "high",
      instructions: "5 โครงสร้างประโยคพื้นฐาน",
      resource_url: null, // Broken in v21
      resource_label: null,
      review_reference_ids: [],
      metadata: { recovery: true },
      created_at: "2026-09-03T00:00:00Z",
    };

    // Verify repair extraction
    const { resourceUrl, resourceLabel } = resolveResourceFields(targetWithoutResource, donor);
    expect(resourceUrl).toBe("https://www.youtube.com/watch?v=GNGZrMu55Ko");
    expect(resourceLabel).toBe("5 โครงสร้างประโยคพื้นฐาน");

    // Verify metadata merge
    const mergedMetadata = mergeItemMetadata(donor.metadata, targetWithoutResource.metadata);
    expect(mergedMetadata).toEqual({
      originalSource: "v7.1",
      recovery: true,
    });
  });

  it("never overwrites existing valid resource_url on target item", () => {
    const donor: PlanItem = {
      id: "item-v20",
      workspace_id: "ws-1",
      plan_version_id: "v-20",
      plan_day_id: "day-v20",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "2026-09-02-alevel-english",
      subject: "A_LEVEL_ENGLISH",
      course_code: null,
      lesson_from: null,
      lesson_to: null,
      activity_type: "course",
      assessment_source_id: null,
      target_minutes: 60,
      priority: "high",
      instructions: "",
      resource_url: "https://www.youtube.com/watch?v=old",
      resource_label: "Old Video",
      review_reference_ids: [],
      metadata: null,
      created_at: "2026-09-02T00:00:00Z",
    };

    const targetWithOwnResource: PlanItem = {
      ...donor,
      id: "item-v21",
      plan_version_id: "v-21",
      resource_url: "https://www.youtube.com/watch?v=new",
      resource_label: "New Video",
    };

    const { resourceUrl, resourceLabel } = resolveResourceFields(targetWithOwnResource, donor);
    expect(resourceUrl).toBe("https://www.youtube.com/watch?v=new");
    expect(resourceLabel).toBe("New Video");
  });
});
