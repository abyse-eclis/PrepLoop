import { describe, it, expect } from "vitest";
import {
  buildPlanItemSessionMap,
  buildPlanItemOverrideMap,
  resolvePlanItemProgress,
  resolvePlanItemsProgress,
} from "./progress";
import type { PlanItem, StudySession, ItemStatusOverride } from "@/types/db";

function makePlanItem(partial: Partial<PlanItem>): PlanItem {
  return {
    id: "item-1",
    workspace_id: "ws-1",
    plan_version_id: "ver-2",
    plan_day_id: "day-1",
    date: "2026-08-31",
    order_index: 1,
    scheduled_at: null,
    stable_external_id: "2026-08-31-alevel-math",
    subject: "MATHEMATICS",
    course_code: "K001",
    lesson_from: null,
    lesson_to: null,
    activity_type: "review",
    assessment_source_id: null,
    target_minutes: 120,
    priority: "high",
    instructions: "Math Repair A",
    resource_url: null,
    resource_label: null,
    review_reference_ids: [],
    metadata: null,
    created_at: "2026-08-31T00:00:00Z",
    ...partial,
  };
}

function makeSession(partial: Partial<StudySession>): StudySession {
  return {
    id: "sess-1",
    workspace_id: "ws-1",
    plan_item_id: "item-1",
    subject: "MATHEMATICS",
    source_activity_id: null,
    assessment_source_external_id: null,
    activity_type: "review",
    course_code: "K001",
    session_date: "2026-08-31",
    start_time: "10:00",
    end_time: "10:30",
    duration_minutes: 30,
    status: "completed",
    actual_lesson_from: null,
    actual_lesson_to: null,
    note: null,
    score: null,
    max_score: null,
    correct: null,
    incorrect: null,
    total_questions: null,
    import_dedup_key: null,
    created_at: "2026-08-31T10:30:00Z",
    updated_at: "2026-08-31T10:30:00Z",
    ...partial,
  };
}

describe("Plan Item Progress Aggregator", () => {
  it("Case A: Multiple sessions on the same date for the same task accumulate accurately", () => {
    const item = makePlanItem({ id: "item-1", target_minutes: 120 });
    const sessions = [
      makeSession({ id: "s1", plan_item_id: "item-1", duration_minutes: 35, session_date: "2026-08-31" }),
      makeSession({ id: "s2", plan_item_id: "item-1", duration_minutes: 10, session_date: "2026-08-31" }),
      makeSession({ id: "s3", plan_item_id: "item-1", duration_minutes: 25, session_date: "2026-08-31" }),
    ];

    const result = resolvePlanItemsProgress([item], sessions);
    expect(result[0].actualMinutes).toBe(70);
    expect(result[0].status).toBe("studying");
  });

  it("Case B: Multiple sessions across different dates accumulate accurately", () => {
    const item = makePlanItem({ id: "item-1", target_minutes: 120 });
    const sessions = [
      makeSession({ id: "s1", plan_item_id: "item-1", duration_minutes: 30, session_date: "2026-08-30" }),
      makeSession({ id: "s2", plan_item_id: "item-1", duration_minutes: 40, session_date: "2026-08-31" }),
      makeSession({ id: "s3", plan_item_id: "item-1", duration_minutes: 20, session_date: "2026-09-01" }),
    ];

    const result = resolvePlanItemsProgress([item], sessions);
    expect(result[0].actualMinutes).toBe(90);
    expect(result[0].sessions).toHaveLength(3);
    expect(result[0].status).toBe("studying");
  });

  it("Case C: Inactivity over multiple days retains accumulated progress", () => {
    const item = makePlanItem({ id: "item-1", target_minutes: 120 });
    const sessions = [
      makeSession({ id: "s1", plan_item_id: "item-1", duration_minutes: 50, session_date: "2026-08-20" }),
    ];

    // Checked on 2026-08-31 (11 days later)
    const result = resolvePlanItemsProgress([item], sessions);
    expect(result[0].actualMinutes).toBe(50);
    expect(result[0].status).toBe("studying");
  });

  it("Case D: Changing the current query date does not alter task-level accumulated progress", () => {
    const item = makePlanItem({ id: "item-1", target_minutes: 120 });
    const sessions = [
      makeSession({ id: "s1", plan_item_id: "item-1", duration_minutes: 70, session_date: "2026-08-31" }),
    ];

    const resDay1 = resolvePlanItemsProgress([item], sessions);
    const resDay2 = resolvePlanItemsProgress([item], sessions);

    expect(resDay1[0].actualMinutes).toBe(70);
    expect(resDay2[0].actualMinutes).toBe(70);
  });

  it("Case E: Studying upcoming task ahead of time records progress separately and properly", () => {
    const item1 = makePlanItem({ id: "item-1", stable_external_id: "task-1", target_minutes: 120 });
    const item2 = makePlanItem({ id: "item-2", stable_external_id: "task-2", target_minutes: 75 });
    const sessions = [
      makeSession({ id: "s1", plan_item_id: "item-1", duration_minutes: 70 }),
      makeSession({ id: "s2", plan_item_id: "item-2", duration_minutes: 45 }),
    ];

    const result = resolvePlanItemsProgress([item1, item2], sessions);
    expect(result[0].actualMinutes).toBe(70);
    expect(result[1].actualMinutes).toBe(45);
  });

  it("Case F: Cross-version stable identity matching aggregates historical sessions with old plan_item_id", () => {
    // Current active item (in Version 21)
    const activeItem = makePlanItem({
      id: "48a66787-a87f-465c-9b1c-b3935c473dc7",
      plan_version_id: "ver-21",
      stable_external_id: "2026-08-31-alevel-math",
      target_minutes: 120,
    });

    // Sessions recorded under old item ID (in Version 20)
    const oldItemId = "11c8f48d-f262-4bd7-97c0-99cedeeb4efb";
    const sessions = [
      makeSession({ id: "s1", plan_item_id: oldItemId, duration_minutes: 35 }),
      makeSession({ id: "s2", plan_item_id: oldItemId, duration_minutes: 10 }),
      makeSession({ id: "s3", plan_item_id: oldItemId, duration_minutes: 25 }),
    ];

    const historicalRefs = [
      { id: oldItemId, stable_external_id: "2026-08-31-alevel-math" },
    ];

    const result = resolvePlanItemsProgress([activeItem], sessions, [], historicalRefs);
    expect(result[0].actualMinutes).toBe(70);
    expect(result[0].sessions).toHaveLength(3);
    expect(result[0].status).toBe("studying");
  });

  it("Cross-version override matching applies override from historical item", () => {
    const activeItem = makePlanItem({
      id: "new-uuid",
      stable_external_id: "2026-08-31-alevel-math",
      target_minutes: 120,
    });
    const oldItemId = "old-uuid";
    const overrides: ItemStatusOverride[] = [
      {
        id: "ov-1",
        plan_item_id: oldItemId,
        status: "studying",
        actual_lesson_from: null,
        actual_lesson_to: null,
      },
    ];
    const historicalRefs = [
      { id: oldItemId, stable_external_id: "2026-08-31-alevel-math" },
    ];

    const result = resolvePlanItemsProgress([activeItem], [], overrides, historicalRefs);
    expect(result[0].status).toBe("studying");
  });

  it("Completing target minutes automatically marks status as completed", () => {
    const item = makePlanItem({ id: "item-1", target_minutes: 120 });
    const sessions = [
      makeSession({ id: "s1", plan_item_id: "item-1", duration_minutes: 120 }),
    ];

    const result = resolvePlanItemsProgress([item], sessions);
    expect(result[0].actualMinutes).toBe(120);
    expect(result[0].status).toBe("completed");
  });
});
