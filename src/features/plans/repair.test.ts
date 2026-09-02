import { describe, expect, it } from "vitest";
import { resolveResourceFields, mergeItemMetadata, isSameLearningContent } from "@/lib/plans/item-preservation";
import { resolveCanonicalResource } from "@/lib/plans/canonical-resources";
import {
  RESOURCE_ENABLED_SUBJECTS,
  shouldShowLearningResource,
} from "@/lib/plans/resource-policy";
import type { PlanItem } from "@/types/db";

describe("plan resource repair logic", () => {
  it("matches target item with donor item and restores resource fields safely when content is identical", () => {
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
      resource_url: null, // Missing in v21
      resource_label: null,
      review_reference_ids: [],
      metadata: { recovery: true },
      created_at: "2026-09-03T00:00:00Z",
    };

    expect(isSameLearningContent(targetWithoutResource, donor)).toBe(true);

    const { resourceUrl, resourceLabel } = resolveResourceFields(targetWithoutResource, donor);
    expect(resourceUrl).toBe("https://www.youtube.com/watch?v=GNGZrMu55Ko");
    expect(resourceLabel).toBe("5 โครงสร้างประโยคพื้นฐาน");

    const mergedMetadata = mergeItemMetadata(donor.metadata, targetWithoutResource.metadata);
    expect(mergedMetadata).toEqual({
      originalSource: "v7.1",
      recovery: true,
    });
  });

  it("strictly REJECTS donor backfilling when stableExternalId matches but instructions/content differ", () => {
    // Real scenario from v7.0.1 vs v7.1
    const donorFromOldVersion: PlanItem = {
      id: "item-v701",
      workspace_id: "ws-1",
      plan_version_id: "v-701",
      plan_day_id: "day-v701",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "2026-09-02-alevel-english",
      subject: "A_LEVEL_ENGLISH",
      course_code: null,
      lesson_from: null,
      lesson_to: null,
      activity_type: "review",
      assessment_source_id: null,
      target_minutes: 60,
      priority: "high",
      instructions: "5 โครงสร้างประโยคพื้นฐาน",
      resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
      resource_label: "5 โครงสร้างประโยคพื้นฐาน",
      review_reference_ids: [],
      metadata: { englishMode: "foundation_pang" },
      created_at: "2026-08-20T00:00:00Z",
    };

    const targetInV71: PlanItem = {
      id: "item-v71",
      workspace_id: "ws-1",
      plan_version_id: "v-71",
      plan_day_id: "day-v71",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "2026-09-02-alevel-english",
      subject: "A_LEVEL_ENGLISH",
      course_code: null,
      lesson_from: null,
      lesson_to: null,
      activity_type: "review",
      assessment_source_id: null,
      target_minutes: 15,
      priority: "high",
      instructions: "Vocabulary in context: เดาความหมายจากบริบทและจดเฉพาะคำที่ไม่รู้ | Timebox 15 นาที",
      resource_url: null,
      resource_label: null,
      review_reference_ids: [],
      metadata: { englishMode: "alevel_exposure" },
      created_at: "2026-09-02T00:00:00Z",
    };

    // Must return false because instructions and englishMode changed!
    expect(isSameLearningContent(targetInV71, donorFromOldVersion)).toBe(false);

    // resolveResourceFields must NOT pull the sentence structure video!
    const { resourceUrl, resourceLabel } = resolveResourceFields(targetInV71, donorFromOldVersion);
    expect(resourceUrl).toBeNull();
    expect(resourceLabel).toBeNull();
  });

  it("resolves English Foundation (foundation_chris_core) canonical resource accurately", () => {
    const chrisItem: PlanItem = {
      id: "item-chris",
      workspace_id: "ws-1",
      plan_version_id: "v-21",
      plan_day_id: "day-v21",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "2026-09-02-english-foundation-chris",
      subject: "A_LEVEL_ENGLISH",
      course_code: null,
      lesson_from: null,
      lesson_to: null,
      activity_type: "course",
      assessment_source_id: null,
      target_minutes: 45,
      priority: "high",
      instructions: "English by Chris 20h — Foundation Core 45 นาที",
      resource_url: null,
      resource_label: null,
      review_reference_ids: [],
      metadata: { englishMode: "foundation_chris_core" },
      created_at: "2026-09-02T00:00:00Z",
    };

    const canonical = resolveCanonicalResource(chrisItem);
    expect(canonical).not.toBeNull();
    expect(canonical?.url).toBe("https://youtu.be/zvvKelLMLtU");
    expect(canonical?.label).toBe("English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง");

    const resolved = resolveResourceFields(chrisItem);
    expect(resolved.resourceUrl).toBe("https://youtu.be/zvvKelLMLtU");
    expect(resolved.resourceLabel).toBe("English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง");
  });

  it("resolves TGAT1 Exposure (tgat1_exposure) canonical resource accurately", () => {
    const tgatItem: PlanItem = {
      id: "item-tgat",
      workspace_id: "ws-1",
      plan_version_id: "v-21",
      plan_day_id: "day-v21",
      date: "2026-09-02",
      order_index: 2,
      scheduled_at: null,
      stable_external_id: "2026-09-02-tgat1-english",
      subject: "TGAT1",
      course_code: null,
      lesson_from: null,
      lesson_to: null,
      activity_type: "review",
      assessment_source_id: null,
      target_minutes: 15,
      priority: "medium",
      instructions: "TGAT1 Exposure 15 นาที: ทำ Question-Response / Short Conversation",
      resource_url: null,
      resource_label: null,
      review_reference_ids: [],
      metadata: { englishMode: "tgat1_exposure" },
      created_at: "2026-09-02T00:00:00Z",
    };

    const canonical = resolveCanonicalResource(tgatItem);
    expect(canonical).not.toBeNull();
    expect(canonical?.url).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
    expect(canonical?.label).toBe("KruP’ONE OpenDurianTCAS");

    const resolved = resolveResourceFields(tgatItem);
    expect(resolved.resourceUrl).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
    expect(resolved.resourceLabel).toBe("KruP’ONE OpenDurianTCAS");
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
      instructions: "test",
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

  it("filters scan targets to ONLY include A_LEVEL_ENGLISH and TGAT1 (excludes Math, Physics, TPAT3, TGAT2, TGAT3)", () => {
    const rawItems: PlanItem[] = [
      {
        id: "item-math",
        workspace_id: "ws-1",
        plan_version_id: "v-21",
        plan_day_id: "day-1",
        date: "2026-09-02",
        order_index: 1,
        scheduled_at: null,
        stable_external_id: "ext-math",
        subject: "MATHEMATICS",
        course_code: "K001",
        lesson_from: null,
        lesson_to: null,
        activity_type: "course",
        assessment_source_id: null,
        target_minutes: 60,
        priority: "high",
        instructions: "Math lesson",
        resource_url: null,
        resource_label: null,
        review_reference_ids: [],
        metadata: null,
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "item-phys",
        workspace_id: "ws-1",
        plan_version_id: "v-21",
        plan_day_id: "day-1",
        date: "2026-09-02",
        order_index: 2,
        scheduled_at: null,
        stable_external_id: "ext-phys",
        subject: "PHYSICS",
        course_code: "X003",
        lesson_from: null,
        lesson_to: null,
        activity_type: "course",
        assessment_source_id: null,
        target_minutes: 60,
        priority: "high",
        instructions: "Physics lesson",
        resource_url: null,
        resource_label: null,
        review_reference_ids: [],
        metadata: null,
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "item-tpat3",
        workspace_id: "ws-1",
        plan_version_id: "v-21",
        plan_day_id: "day-1",
        date: "2026-09-02",
        order_index: 3,
        scheduled_at: null,
        stable_external_id: "ext-tpat3",
        subject: "TPAT3",
        course_code: "R021",
        lesson_from: null,
        lesson_to: null,
        activity_type: "course",
        assessment_source_id: null,
        target_minutes: 60,
        priority: "high",
        instructions: "TPAT3 lesson",
        resource_url: null,
        resource_label: null,
        review_reference_ids: [],
        metadata: null,
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "item-eng",
        workspace_id: "ws-1",
        plan_version_id: "v-21",
        plan_day_id: "day-1",
        date: "2026-09-02",
        order_index: 4,
        scheduled_at: null,
        stable_external_id: "ext-eng",
        subject: "A_LEVEL_ENGLISH",
        course_code: null,
        lesson_from: null,
        lesson_to: null,
        activity_type: "course",
        assessment_source_id: null,
        target_minutes: 60,
        priority: "high",
        instructions: "English lesson",
        resource_url: null,
        resource_label: null,
        review_reference_ids: [],
        metadata: null,
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "item-tgat1",
        workspace_id: "ws-1",
        plan_version_id: "v-21",
        plan_day_id: "day-1",
        date: "2026-09-02",
        order_index: 5,
        scheduled_at: null,
        stable_external_id: "ext-tgat1",
        subject: "TGAT1",
        course_code: null,
        lesson_from: null,
        lesson_to: null,
        activity_type: "review",
        assessment_source_id: null,
        target_minutes: 15,
        priority: "medium",
        instructions: "TGAT1 lesson",
        resource_url: null,
        resource_label: null,
        review_reference_ids: [],
        metadata: null,
        created_at: "2026-09-02T00:00:00Z",
      },
    ];

    const repairTargets = rawItems.filter((i) => shouldShowLearningResource(i.subject));
    expect(repairTargets.map((t) => t.subject)).toEqual([
      "A_LEVEL_ENGLISH",
      "TGAT1",
    ]);
  });

  it("preserves existing resource_url on non-English items during preservation resolution", () => {
    const mathItemWithResource: PlanItem = {
      id: "item-math-1",
      workspace_id: "ws-1",
      plan_version_id: "v-20",
      plan_day_id: "day-1",
      date: "2026-09-02",
      order_index: 1,
      scheduled_at: null,
      stable_external_id: "ext-math-k001",
      subject: "MATHEMATICS",
      course_code: "K001",
      lesson_from: "01",
      lesson_to: "02",
      activity_type: "course",
      assessment_source_id: null,
      target_minutes: 60,
      priority: "high",
      instructions: "Math K001",
      resource_url: "https://smartmathpro.com/lesson/1",
      resource_label: "SmartMathPro",
      review_reference_ids: [],
      metadata: null,
      created_at: "2026-09-02T00:00:00Z",
    };

    const targetItem: PlanItem = {
      ...mathItemWithResource,
      id: "item-math-2",
      plan_version_id: "v-21",
    };

    const { resourceUrl, resourceLabel } = resolveResourceFields(targetItem, mathItemWithResource);
    expect(resourceUrl).toBe("https://smartmathpro.com/lesson/1");
    expect(resourceLabel).toBe("SmartMathPro");
  });
});
