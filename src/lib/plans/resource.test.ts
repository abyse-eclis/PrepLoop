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

  it("resolves canonical resources via metadata (e.g. English by Chris & KruP'ONE TGAT1)", () => {
    const chrisItem = getPlanItemResource(
      planItem({
        subject: "A_LEVEL_ENGLISH",
        metadata: { englishMode: "foundation_chris_core" },
      })
    );
    expect(chrisItem).toEqual({
      url: "https://youtu.be/zvvKelLMLtU",
      label: "เปิดวิดีโอ",
      sourceName: "English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง",
      tooltip: "เปิดวิดีโอในแท็บใหม่",
    });

    const tgatItem = getPlanItemResource(
      planItem({
        subject: "TGAT1",
        metadata: { englishMode: "tgat1_exposure" },
      })
    );
    expect(tgatItem).toEqual({
      url: "https://www.youtube.com/watch?v=0nXxgts-RWc",
      label: "เปิดวิดีโอ",
      sourceName: "KruP’ONE OpenDurianTCAS",
      tooltip: "เปิดวิดีโอในแท็บใหม่",
    });
  });

  it("labels YouTube URLs as 'เปิดวิดีโอ'", () => {
    const ytItem = planItem({
      subject: "A_LEVEL_ENGLISH",
      resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
      resource_label: "5 โครงสร้างประโยคพื้นฐาน",
    });
    const resource = getPlanItemResource(ytItem);
    expect(resource).toEqual({
      url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
      label: "เปิดวิดีโอ",
      sourceName: "5 โครงสร้างประโยคพื้นฐาน",
      tooltip: "เปิดวิดีโอในแท็บใหม่",
    });

    const youtuBeItem = planItem({
      subject: "TGAT1",
      resource_url: "https://youtu.be/0nXxgts-RWc",
      resource_label: "TGAT1 Vocab",
    });
    const ytBeResource = getPlanItemResource(youtuBeItem);
    expect(ytBeResource?.label).toBe("เปิดวิดีโอ");
  });

  it("labels generic non-YouTube URLs as 'เปิดแหล่งเรียน'", () => {
    const genericItem = planItem({
      subject: "MATHEMATICS",
      resource_url: "https://smartmathpro.com/lesson/1",
      resource_label: "SmartMathPro",
    });
    const resource = getPlanItemResource(genericItem);
    expect(resource).toEqual({
      url: "https://smartmathpro.com/lesson/1",
      label: "เปิดแหล่งเรียน",
      sourceName: "SmartMathPro",
      tooltip: "เปิดแหล่งเรียนในแท็บใหม่",
    });
  });

  it("returns null for items with no resource URL or invalid URLs and no canonical mapping", () => {
    expect(
      getPlanItemResource(
        planItem({ resource_url: "javascript:alert(1)", metadata: null })
      )
    ).toBeNull();
    expect(getPlanItemResource(planItem({ resource_url: null, metadata: null }))).toBeNull();
    expect(getPlanItemResource(planItem({ resource_url: undefined, metadata: {} }))).toBeNull();
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
