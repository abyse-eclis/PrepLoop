import { describe, expect, it } from "vitest";
import {
  RESOURCE_ENABLED_SUBJECTS,
  getPlanItemResourceDisplayState,
  shouldShowLearningResource,
} from "./resource-policy";
import type { PlanItem } from "@/types/db";

function createMockPlanItem(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: "mock-item-1",
    workspace_id: "mock-ws",
    plan_version_id: "mock-ver",
    plan_day_id: "mock-day",
    date: "2026-09-02",
    order_index: 1,
    scheduled_at: null,
    stable_external_id: "mock-ext-1",
    subject: "A_LEVEL_ENGLISH",
    course_code: null,
    lesson_from: null,
    lesson_to: null,
    activity_type: "course",
    assessment_source_id: null,
    target_minutes: 60,
    priority: "high",
    instructions: "Sample instruction",
    resource_url: null,
    resource_label: null,
    review_reference_ids: [],
    metadata: null,
    created_at: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

describe("resource-policy", () => {
  describe("shouldShowLearningResource", () => {
    it("returns true for English subjects (A_LEVEL_ENGLISH, TGAT1)", () => {
      expect(shouldShowLearningResource("A_LEVEL_ENGLISH")).toBe(true);
      expect(shouldShowLearningResource("TGAT1")).toBe(true);
    });

    it("returns false for non-English subjects", () => {
      expect(shouldShowLearningResource("MATHEMATICS")).toBe(false);
      expect(shouldShowLearningResource("PHYSICS")).toBe(false);
      expect(shouldShowLearningResource("TPAT3")).toBe(false);
      expect(shouldShowLearningResource("TPAT2")).toBe(false);
      expect(shouldShowLearningResource("TGAT2")).toBe(false);
      expect(shouldShowLearningResource("TGAT3")).toBe(false);
      expect(shouldShowLearningResource("CHEMISTRY")).toBe(false);
      expect(shouldShowLearningResource("BIOLOGY")).toBe(false);
    });

    it("handles empty, null, or undefined values gracefully", () => {
      expect(shouldShowLearningResource(null)).toBe(false);
      expect(shouldShowLearningResource(undefined)).toBe(false);
      expect(shouldShowLearningResource("")).toBe(false);
    });

    it("exports RESOURCE_ENABLED_SUBJECTS list correctly", () => {
      expect([...RESOURCE_ENABLED_SUBJECTS]).toEqual([
        "A_LEVEL_ENGLISH",
        "TGAT1",
      ]);
    });
  });

  describe("getPlanItemResourceDisplayState (UI / Logic testing)", () => {
    it("A_LEVEL_ENGLISH + URL -> shows link", () => {
      const item = createMockPlanItem({
        subject: "A_LEVEL_ENGLISH",
        resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resource_label: "English Video",
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("link");
      if (state.type === "link") {
        expect(state.resource.url).toBe("https://www.youtube.com/watch?v=GNGZrMu55Ko");
        expect(state.resource.label).toBe("เปิดวิดีโอ");
      }
    });

    it("A_LEVEL_ENGLISH + no URL -> shows missing warning", () => {
      const item = createMockPlanItem({
        subject: "A_LEVEL_ENGLISH",
        resource_url: null,
        metadata: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("missing_warning");
      expect(state.resource).toBeNull();
    });

    it("TGAT1 + URL -> shows link", () => {
      const item = createMockPlanItem({
        subject: "TGAT1",
        resource_url: "https://www.youtube.com/watch?v=0nXxgts-RWc",
        resource_label: "TGAT1 Vocab",
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("link");
      if (state.type === "link") {
        expect(state.resource.url).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
        expect(state.resource.label).toBe("เปิดวิดีโอ");
      }
    });

    it("TGAT1 + no URL -> shows missing warning", () => {
      const item = createMockPlanItem({
        subject: "TGAT1",
        resource_url: null,
        metadata: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("missing_warning");
      expect(state.resource).toBeNull();
    });

    it("MATHEMATICS + no URL -> renders neither link nor warning (type: none)", () => {
      const item = createMockPlanItem({
        subject: "MATHEMATICS",
        resource_url: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("none");
      expect(state.resource).toBeNull();
    });

    it("PHYSICS + no URL -> renders neither link nor warning (type: none)", () => {
      const item = createMockPlanItem({
        subject: "PHYSICS",
        resource_url: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("none");
      expect(state.resource).toBeNull();
    });

    it("TPAT3 + no URL -> renders neither link nor warning (type: none)", () => {
      const item = createMockPlanItem({
        subject: "TPAT3",
        resource_url: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("none");
      expect(state.resource).toBeNull();
    });

    it("TGAT2 + no URL -> renders neither link nor warning (type: none)", () => {
      const item = createMockPlanItem({
        subject: "TGAT2",
        resource_url: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("none");
      expect(state.resource).toBeNull();
    });

    it("TGAT3 + no URL -> renders neither link nor warning (type: none)", () => {
      const item = createMockPlanItem({
        subject: "TGAT3",
        resource_url: null,
      });

      const state = getPlanItemResourceDisplayState(item);
      expect(state.type).toBe("none");
      expect(state.resource).toBeNull();
    });
  });
});
