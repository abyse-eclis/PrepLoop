import { describe, expect, it } from "vitest";
import {
  getPlanInputResource,
  getPlanItemResource,
  toExportablePlanItem,
} from "./resource";
import type { PlanItem } from "@/types/db";

function planItem(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: "item-1",
    workspace_id: "workspace-1",
    plan_version_id: "version-1",
    plan_day_id: "day-1",
    date: "2026-08-05",
    order_index: 1,
    scheduled_at: null,
    stable_external_id: "2026-08-05-item",
    subject: "TGAT1",
    course_code: null,
    lesson_from: null,
    lesson_to: null,
    activity_type: "review",
    assessment_source_id: null,
    target_minutes: 60,
    priority: "medium",
    instructions: "ทบทวน",
    resource_url: null,
    resource_label: null,
    review_reference_ids: [],
    metadata: null,
    created_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("plan item resources", () => {
  it("uses resourceUrl before metadata fallbacks", () => {
    expect(
      getPlanInputResource({
        resourceUrl: "https://example.com/resource",
        metadata: { videoUrl: "https://youtube.com/watch?v=old" },
      })
    ).toBe("https://example.com/resource");
  });

  it("falls back to metadata.videoUrl", () => {
    const resource = getPlanItemResource(
      planItem({ metadata: { videoUrl: "https://youtube.com/watch?v=abc" } })
    );

    expect(resource).toEqual({
      url: "https://youtube.com/watch?v=abc",
      label: "เปิดวิดีโอ",
      sourceName: null,
      tooltip: "เปิดวิดีโอในแท็บใหม่",
    });
  });

  it("labels generic websites as learning sources", () => {
    expect(
      getPlanItemResource(
        planItem({
          resource_url: "https://example.com/resource",
          resource_label: "SmartMathPro",
        })
      )
    ).toEqual({
      url: "https://example.com/resource",
      label: "เปิดแหล่งเรียน",
      sourceName: "SmartMathPro",
      tooltip: "เปิดแหล่งเรียนในแท็บใหม่",
    });
  });

  it("does not return invalid or missing links", () => {
    expect(
      getPlanItemResource(
        planItem({ resource_url: "javascript:alert(1)", metadata: null })
      )
    ).toBeNull();
    expect(getPlanItemResource(planItem({}))).toBeNull();
  });
});

describe("plan item resource export", () => {
  it("keeps normalized resourceUrl when exporting fallback-only input", () => {
    expect(
      toExportablePlanItem({
        stableExternalId: "2026-08-05-krupone-noun-review",
        subject: "TGAT1",
        activityType: "review",
        targetMinutes: 60,
        priority: "medium",
        instructions: "ทบทวนคลิป Noun",
        reviewReferenceIds: [],
        metadata: { videoUrl: "https://www.youtube.com/watch?v=0nXxgts-RWc" },
      }).resourceUrl
    ).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
  });
});
