import { describe, expect, it } from "vitest";
import {
  isSameLearningContent,
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
    instructions: "เรียน 5 โครงสร้างประโยคพื้นฐาน",
    resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
    resource_label: "5 โครงสร้างประโยคพื้นฐาน",
    review_reference_ids: ["ref-1"],
    metadata: { customField: "important", videoUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko" },
    created_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("item-preservation", () => {
  describe("isSameLearningContent", () => {
    it("returns true when subject, course, and topic match", () => {
      const target = {
        subject: "A_LEVEL_ENGLISH",
        activityType: "course",
        courseCode: "ENG101",
        lessonFrom: "001",
        lessonTo: "002",
        instructions: "เรียน 5 โครงสร้างประโยคพื้นฐาน",
      };
      const donor = {
        subject: "A_LEVEL_ENGLISH",
        activity_type: "course",
        course_code: "ENG101",
        lesson_from: "001",
        lesson_to: "002",
        instructions: "เรียน 5 โครงสร้างประโยคพื้นฐาน",
      };
      expect(isSameLearningContent(target, donor)).toBe(true);
    });

    it("returns false when subjects differ", () => {
      const target = { subject: "A_LEVEL_ENGLISH", instructions: "grammar" };
      const donor = { subject: "MATHEMATICS", instructions: "grammar" };
      expect(isSameLearningContent(target, donor)).toBe(false);
    });

    it("returns false when instructions indicate different learning topics", () => {
      const target = {
        subject: "A_LEVEL_ENGLISH",
        instructions: "Vocabulary in context: เดาความหมายจากบริบทและจดเฉพาะคำที่ไม่รู้ | Timebox 15 นาที",
        metadata: { englishMode: "alevel_exposure" },
      };
      const donor = {
        subject: "A_LEVEL_ENGLISH",
        instructions: "5 โครงสร้างประโยคพื้นฐาน",
        metadata: { englishMode: "foundation_pang" },
      };
      expect(isSameLearningContent(target, donor)).toBe(false);
    });

    it("returns false when metadata englishMode differs", () => {
      const target = {
        subject: "A_LEVEL_ENGLISH",
        instructions: "Study english",
        metadata: { englishMode: "alevel_exposure" },
      };
      const donor = {
        subject: "A_LEVEL_ENGLISH",
        instructions: "Study english",
        metadata: { englishMode: "foundation_chris_core" },
      };
      expect(isSameLearningContent(target, donor)).toBe(false);
    });
  });

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

    it("resolves canonical resource for foundation_chris_core", () => {
      const item = {
        subject: "A_LEVEL_ENGLISH",
        metadata: { englishMode: "foundation_chris_core" },
      };
      const res = resolveResourceFields(item);
      expect(res.resourceUrl).toBe("https://youtu.be/zvvKelLMLtU");
      expect(res.resourceLabel).toBe("English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง");
    });

    it("resolves canonical resource for tgat1_exposure", () => {
      const item = {
        subject: "TGAT1",
        metadata: { englishMode: "tgat1_exposure" },
      };
      const res = resolveResourceFields(item);
      expect(res.resourceUrl).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
      expect(res.resourceLabel).toBe("KruP’ONE OpenDurianTCAS");
    });

    it("falls back to sourceItem resource_url ONLY if semantic content matches", () => {
      const source = mockPlanItem({
        resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resource_label: "5 โครงสร้างประโยคพื้นฐาน",
        instructions: "5 โครงสร้างประโยคพื้นฐาน",
      });
      const targetSameContent = {
        stableExternalId: source.stable_external_id,
        subject: "A_LEVEL_ENGLISH",
        instructions: "5 โครงสร้างประโยคพื้นฐาน",
      };
      const res = resolveResourceFields(targetSameContent, source);
      expect(res).toEqual({
        resourceUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resourceLabel: "5 โครงสร้างประโยคพื้นฐาน",
      });
    });

    it("does NOT fallback to sourceItem if instructions/topic differ (e.g. v7.0.1 sentence structure vs v7.1 vocab in context)", () => {
      const source = mockPlanItem({
        resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resource_label: "5 โครงสร้างประโยคพื้นฐาน",
        instructions: "5 โครงสร้างประโยคพื้นฐาน",
        metadata: { englishMode: "foundation_pang" },
      });
      const targetDifferentContent = {
        stableExternalId: source.stable_external_id,
        subject: "A_LEVEL_ENGLISH",
        instructions: "Vocabulary in context: เดาความหมายจากบริบทและจดเฉพาะคำที่ไม่รู้",
        metadata: { englishMode: "alevel_exposure" },
      };
      const res = resolveResourceFields(targetDifferentContent, source);
      expect(res.resourceUrl).toBeNull();
      expect(res.resourceLabel).toBeNull();
    });
  });

  describe("preservePlanItemFields", () => {
    it("preserves all core content fields from sourceItem during recovery or cloning", () => {
      const source = mockPlanItem({});
      const incoming = {
        stableExternalId: source.stable_external_id,
        subject: source.subject,
        instructions: source.instructions,
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
        instructions: "เรียน 5 โครงสร้างประโยคพื้นฐาน",
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
