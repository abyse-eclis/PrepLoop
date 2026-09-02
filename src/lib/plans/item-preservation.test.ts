import { describe, expect, it } from "vitest";
import {
  mergeItemMetadata,
  preservePlanItemFields,
  resolveResourceFields,
} from "./item-preservation";
import type { PlanItem } from "@/types/db";

function mockPlanItem(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: "item-1",
    workspace_id: "workspace-1",
    plan_version_id: "version-1",
    plan_day_id: "day-1",
    date: "2026-08-05",
    order_index: 1,
    scheduled_at: null,
    stable_external_id: "2026-08-05-alevel-english",
    subject: "A_LEVEL_ENGLISH",
    course_code: "ENG101",
    lesson_from: "001",
    lesson_to: "002",
    activity_type: "course",
    assessment_source_id: "eng-diag-1",
    target_minutes: 60,
    priority: "high",
    instructions: "เรียนบทที่ 1",
    resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
    resource_label: "5 โครงสร้างประโยคพื้นฐาน",
    review_reference_ids: ["ref-1"],
    metadata: { customField: "important", videoUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko" },
    created_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("item-preservation", () => {
  describe("mergeItemMetadata", () => {
    it("merges source and incoming metadata safely without overwriting unmodified fields", () => {
      const source = { existingKey: "value1", videoUrl: "https://youtube.com/1" };
      const incoming = { newKey: "value2" };
      const merged = mergeItemMetadata(source, incoming, { recovery: true });

      expect(merged).toEqual({
        existingKey: "value1",
        videoUrl: "https://youtube.com/1",
        newKey: "value2",
        recovery: true,
      });
    });

    it("returns null when all metadata inputs are empty", () => {
      expect(mergeItemMetadata(null, null, null)).toBeNull();
      expect(mergeItemMetadata(undefined, undefined, {})).toBeNull();
    });
  });

  describe("resolveResourceFields", () => {
    it("preserves direct resource_url from incoming item", () => {
      const res = resolveResourceFields({
        resourceUrl: "https://youtube.com/watch?v=new",
        resourceLabel: "New Label",
      });
      expect(res).toEqual({
        resourceUrl: "https://youtube.com/watch?v=new",
        resourceLabel: "New Label",
      });
    });

    it("falls back to sourceItem resource_url if incoming does not specify one", () => {
      const source = mockPlanItem({
        resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resource_label: "5 โครงสร้างประโยคพื้นฐาน",
      });
      const res = resolveResourceFields({ stableExternalId: source.stable_external_id }, source);
      expect(res).toEqual({
        resourceUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resourceLabel: "5 โครงสร้างประโยคพื้นฐาน",
      });
    });

    it("falls back to metadata.videoUrl if direct resource_url is absent", () => {
      const source = mockPlanItem({
        resource_url: null,
        resource_label: "5 โครงสร้างประโยคพื้นฐาน",
        metadata: { videoUrl: "https://www.youtube.com/watch?v=fallback" },
      });
      const res = resolveResourceFields({ stableExternalId: source.stable_external_id }, source);
      expect(res.resourceUrl).toBe("https://www.youtube.com/watch?v=fallback");
      expect(res.resourceLabel).toBe("5 โครงสร้างประโยคพื้นฐาน");
    });
  });

  describe("preservePlanItemFields", () => {
    it("preserves all core content fields from sourceItem during recovery or cloning", () => {
      const source = mockPlanItem({});
      const incoming = {
        stableExternalId: source.stable_external_id,
        targetMinutes: 45, // rearranged by recovery
      };

      const preserved = preservePlanItemFields(incoming, source, {
        extraMetadata: { recovery: true },
      });

      expect(preserved).toEqual({
        stable_external_id: "2026-08-05-alevel-english",
        subject: "A_LEVEL_ENGLISH",
        course_code: "ENG101",
        lesson_from: "001",
        lesson_to: "002",
        activity_type: "course",
        assessment_source_id: "eng-diag-1",
        target_minutes: 45, // updated
        priority: "high",
        instructions: "เรียนบทที่ 1",
        resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko", // preserved
        resource_label: "5 โครงสร้างประโยคพื้นฐาน", // preserved
        review_reference_ids: ["ref-1"],
        metadata: {
          customField: "important",
          videoUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
          recovery: true, // merged
        },
      });
    });

    it("works correctly when sourceItem has no resource", () => {
      const source = mockPlanItem({
        resource_url: null,
        resource_label: null,
        metadata: null,
      });

      const preserved = preservePlanItemFields(
        { stableExternalId: source.stable_external_id },
        source
      );

      expect(preserved.resource_url).toBeNull();
      expect(preserved.resource_label).toBeNull();
      expect(preserved.metadata).toBeNull();
    });
  });
});
