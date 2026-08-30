import { describe, expect, it } from "vitest";
import { groupSessionsByPlanItem } from "./data";
import type { PlanItem, StudySession } from "@/types/db";

function item(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: "plan-item-1",
    workspace_id: "workspace-1",
    plan_version_id: "version-1",
    plan_day_id: "day-1",
    date: "2026-08-01",
    order_index: 1,
    scheduled_at: null,
    stable_external_id: "2026-08-01-k001-002-006",
    subject: "MATHEMATICS",
    course_code: "K001",
    lesson_from: "002",
    lesson_to: "006",
    activity_type: "course",
    assessment_source_id: null,
    target_minutes: 100,
    priority: "high",
    instructions: "เรียน K001",
    resource_url: null,
    resource_label: null,
    review_reference_ids: [],
    metadata: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function session(overrides: Partial<StudySession>): StudySession {
  return {
    id: crypto.randomUUID(),
    workspace_id: "workspace-1",
    plan_item_id: null,
    subject: "MATHEMATICS",
    source_activity_id: null,
    assessment_source_external_id: null,
    activity_type: "course",
    course_code: "K001",
    session_date: "2026-08-01",
    start_time: "16:00",
    end_time: "17:15",
    duration_minutes: 75,
    status: "completed",
    actual_lesson_from: "002",
    actual_lesson_to: "006",
    note: null,
    score: null,
    max_score: null,
    correct: null,
    incorrect: null,
    total_questions: null,
    import_dedup_key: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("history session matching", () => {
  it("groups multiple sessions by sourceActivityId without deduping them", () => {
    const plan = item({});
    const grouped = groupSessionsByPlanItem(
      [
        session({ source_activity_id: plan.stable_external_id, duration_minutes: 75 }),
        session({
          source_activity_id: plan.stable_external_id,
          start_time: "18:40",
          end_time: "18:50",
          duration_minutes: 10,
        }),
        session({
          source_activity_id: plan.stable_external_id,
          start_time: "19:00",
          end_time: "19:15",
          duration_minutes: 15,
        }),
      ],
      [plan]
    );

    expect(grouped.unplanned).toHaveLength(0);
    expect(grouped.sessionsByPlanItemId.get(plan.id)).toHaveLength(3);
    expect(
      grouped.sessionsByPlanItemId
        .get(plan.id)!
        .reduce((sum, s) => sum + s.duration_minutes, 0)
    ).toBe(100);
  });

  it("matches assessment sessions by assessmentSourceId", () => {
    const plan = item({
      id: "assessment-plan-item",
      stable_external_id: "2026-08-01-english-diagnostic",
      activity_type: "diagnostic",
      assessment_source_id: "assessment-alevel-english-set1",
    });
    const grouped = groupSessionsByPlanItem(
      [
        session({
          source_activity_id: null,
          assessment_source_external_id: "assessment-alevel-english-set1",
          activity_type: "diagnostic",
          course_code: null,
        }),
      ],
      [plan]
    );

    expect(grouped.sessionsByPlanItemId.get(plan.id)).toHaveLength(1);
    expect(grouped.matches[0]!.reason).toBe("assessment_source_id");
  });

  it("keeps history visible as unplanned when there is no plan", () => {
    const grouped = groupSessionsByPlanItem([session({})], []);

    expect(grouped.unplanned).toHaveLength(1);
    expect(grouped.matches[0]!.planItem).toBeNull();
  });
});
