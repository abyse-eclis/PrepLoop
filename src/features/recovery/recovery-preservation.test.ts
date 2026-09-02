import { describe, expect, it } from "vitest";
import { buildMockRecovery, type RecoveryContext } from "@/lib/anthropic/recovery";
import { preservePlanItemFields } from "@/lib/plans/item-preservation";
import type { PlanItem } from "@/types/db";

describe("recovery resource preservation", () => {
  it("buildMockRecovery accepts pending items with resource fields", () => {
    const ctx: RecoveryContext = {
      activePlanVersionId: "v-20",
      effectiveFrom: "2026-09-03",
      dailyHourLimitMinutes: 300,
      studyConstraints: {},
      examDates: [],
      completedLessons: [],
      notYetLearnedLessons: [],
      pendingPlanItems: [
        {
          stableExternalId: "2026-09-02-alevel-english",
          subject: "A_LEVEL_ENGLISH",
          courseCode: "ENG101",
          activityType: "course",
          targetMinutes: 60,
          priority: "high",
          date: "2026-09-02",
          resourceUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
          resourceLabel: "5 โครงสร้างประโยคพื้นฐาน",
          metadata: { note: "watch chapter 1" },
        },
      ],
      overdueReviews: [],
      weakTopics: ["Grammar"],
      failedAssessments: [],
      repeatedErrorTypes: [],
      recentStudyMinutes: 120,
    };

    const outcome = buildMockRecovery(ctx);
    expect(outcome.plan.days.length).toBeGreaterThan(0);
  });

  it("preserves source resource_url, resource_label, and merges metadata when confirming recovery", () => {
    const parentPlanItem: PlanItem = {
      id: "parent-item-1",
      workspace_id: "ws-1",
      plan_version_id: "v-20",
      plan_day_id: "d-1",
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
      instructions: "เรียน 5 โครงสร้างประโยคพื้นฐาน",
      resource_url: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
      resource_label: "5 โครงสร้างประโยคพื้นฐาน",
      review_reference_ids: [],
      metadata: { customField: "keep-me" },
      created_at: "2026-09-02T00:00:00Z",
    };

    const recoveryDayItem = {
      stableExternalId: "2026-09-02-alevel-english",
      targetMinutes: 45,
      priority: "high" as const,
      instructions: "ทบทวนบทเรียน",
    };

    const preserved = preservePlanItemFields(
      recoveryDayItem,
      parentPlanItem,
      { extraMetadata: { recovery: true } }
    );

    // Assert that resource_url is NOT null and matches parent
    expect(preserved.resource_url).toBe("https://www.youtube.com/watch?v=GNGZrMu55Ko");
    expect(preserved.resource_label).toBe("5 โครงสร้างประโยคพื้นฐาน");
    // Assert metadata is merged, not replaced with just { recovery: true }
    expect(preserved.metadata).toEqual({
      customField: "keep-me",
      recovery: true,
    });
  });
});
