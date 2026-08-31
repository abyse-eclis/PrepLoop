import { describe, it, expect } from "vitest";
import {
  applyExecutionOrder,
  checkTaskPrerequisites,
  normalizeOrderedIds,
} from "@/lib/execution-order";
import {
  deriveExecutionState,
  statusFromActualMinutes,
  actualMinutesFromSessions,
} from "@/lib/study-execution";
import type { StudySession } from "@/types/db";

describe("Today Queue & Study Now Integration Flows", () => {
  it("Scenario 1: Reorder 8 tasks and verify order persistence", () => {
    const planItems = [
      { id: "task-1", subject: "Math", priority: "high" },
      { id: "task-2", subject: "Physics", priority: "high" },
      { id: "task-3", subject: "Chemistry", priority: "medium" },
      { id: "task-4", subject: "Biology", priority: "medium" },
      { id: "task-5", subject: "English", priority: "medium" },
      { id: "task-6", subject: "Thai", priority: "low" },
      { id: "task-7", subject: "Social", priority: "low" },
      { id: "task-8", subject: "Aptitude", priority: "low" },
    ];

    const customOrder = [
      "task-8",
      "task-5",
      "task-2",
      "task-1",
      "task-7",
      "task-3",
      "task-6",
      "task-4",
    ];

    // Simulate saving custom order
    const savedOrder = normalizeOrderedIds(customOrder);
    expect(savedOrder).toEqual(customOrder);

    // Simulate page refresh / fetching queue with saved order
    const orderedQueue = applyExecutionOrder(planItems, savedOrder);
    expect(orderedQueue.map((item) => item.id)).toEqual(customOrder);
  });

  it("Scenario 2: Study task A for 70/120 min, switch to B -> task A progress remains 70/120 and not completed", () => {
    const taskA = {
      id: "task-A",
      target_minutes: 120,
      date: "2026-08-31",
    };

    // Task A has 2 logged sessions totaling 70 minutes (40 min + 30 min)
    const taskASessions: StudySession[] = [
      {
        id: "sess-1",
        workspace_id: "ws-1",
        plan_item_id: "task-A",
        subject: "Math",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: "lecture",
        course_code: "MATH01",
        session_date: "2026-08-31",
        start_time: "09:00",
        end_time: "09:40",
        duration_minutes: 40,
        status: "completed",
        actual_lesson_from: "01",
        actual_lesson_to: "01",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T09:40:00Z",
        updated_at: "2026-08-31T09:40:00Z",
      },
      {
        id: "sess-2",
        workspace_id: "ws-1",
        plan_item_id: "task-A",
        subject: "Math",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: "lecture",
        course_code: "MATH01",
        session_date: "2026-08-31",
        start_time: "10:00",
        end_time: "10:30",
        duration_minutes: 30,
        status: "completed",
        actual_lesson_from: "01",
        actual_lesson_to: "01",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T10:30:00Z",
        updated_at: "2026-08-31T10:30:00Z",
      },
    ];

    const actualMinutesA = actualMinutesFromSessions(taskASessions);
    expect(actualMinutesA).toBe(70);

    // Status is paused when switched to Task B
    const statusAAfterSwitch = "paused";
    const executionStateA = deriveExecutionState({
      plannedDate: taskA.date,
      today: "2026-08-31",
      status: statusAAfterSwitch,
      sessions: taskASessions,
      targetMinutes: taskA.target_minutes,
    });

    // Task A must NOT be marked completed
    expect(executionStateA).toBe("paused");
    expect(executionStateA.startsWith("completed_")).toBe(false);

    // Task B becomes studying
    const taskB = {
      id: "task-B",
      target_minutes: 60,
      date: "2026-08-31",
    };
    const taskBSessions: StudySession[] = [];
    const executionStateB = deriveExecutionState({
      plannedDate: taskB.date,
      today: "2026-08-31",
      status: "studying",
      sessions: taskBSessions,
      targetMinutes: taskB.target_minutes,
    });
    expect(executionStateB).toBe("in_progress");
  });

  it("Scenario 3: Complete task B and resume task A with 70/120 min intact", () => {
    // Task B completed
    const taskB = {
      id: "task-B",
      target_minutes: 60,
      date: "2026-08-31",
    };
    const taskBSessions: StudySession[] = [
      {
        id: "sess-3",
        workspace_id: "ws-1",
        plan_item_id: "task-B",
        subject: "Physics",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: "quiz",
        course_code: "PHYS01",
        session_date: "2026-08-31",
        start_time: "11:00",
        end_time: "12:00",
        duration_minutes: 60,
        status: "completed",
        actual_lesson_from: "01",
        actual_lesson_to: "01",
        note: null,
        score: 10,
        max_score: 10,
        correct: 10,
        incorrect: 0,
        total_questions: 10,
        import_dedup_key: null,
        created_at: "2026-08-31T12:00:00Z",
        updated_at: "2026-08-31T12:00:00Z",
      },
    ];

    const stateB = deriveExecutionState({
      plannedDate: taskB.date,
      today: "2026-08-31",
      status: "completed",
      sessions: taskBSessions,
      targetMinutes: taskB.target_minutes,
    });
    expect(stateB).toBe("completed_on_time");

    // Resuming Task A
    const taskASessions: StudySession[] = [
      {
        id: "sess-1",
        workspace_id: "ws-1",
        plan_item_id: "task-A",
        subject: "Math",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: "lecture",
        course_code: "MATH01",
        session_date: "2026-08-31",
        start_time: "09:00",
        end_time: "09:40",
        duration_minutes: 40,
        status: "completed",
        actual_lesson_from: "01",
        actual_lesson_to: "01",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T09:40:00Z",
        updated_at: "2026-08-31T09:40:00Z",
      },
      {
        id: "sess-2",
        workspace_id: "ws-1",
        plan_item_id: "task-A",
        subject: "Math",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: "lecture",
        course_code: "MATH01",
        session_date: "2026-08-31",
        start_time: "10:00",
        end_time: "10:30",
        duration_minutes: 30,
        status: "completed",
        actual_lesson_from: "01",
        actual_lesson_to: "01",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T10:30:00Z",
        updated_at: "2026-08-31T10:30:00Z",
      },
    ];

    const stateAResumed = deriveExecutionState({
      plannedDate: "2026-08-31",
      today: "2026-08-31",
      status: "studying",
      sessions: taskASessions,
      targetMinutes: 120,
    });
    expect(stateAResumed).toBe("in_progress");
    expect(actualMinutesFromSessions(taskASessions)).toBe(70);
  });

  it("Scenario 4: Reset order returns queue to default plan engine order", () => {
    const defaultPlanOrder = [
      { id: "task-1", priority: "high" },
      { id: "task-2", priority: "medium" },
      { id: "task-3", priority: "low" },
    ];

    // When reset, customOrder is null
    const restoredQueue = applyExecutionOrder(defaultPlanOrder, null);
    expect(restoredQueue).toEqual(defaultPlanOrder);
  });

  it("Scenario 5: Prerequisite check blocks unfulfilled tasks with clear explanation", () => {
    const blockedAssessment = {
      course_code: "CHEM01",
      assessment_source_id: "mock-chem-1",
      activity_type: "mock",
    };

    const context = {
      completedLessonsByCourse: new Map([["CHEM01", new Set(["01", "02"])]]),
      assessmentRequiredLessons: new Map([
        ["mock-chem-1", ["01", "02", "03", "04"]],
      ]),
    };

    const check = checkTaskPrerequisites(blockedAssessment, context);
    expect(check.isBlocked).toBe(true);
    expect(check.reason).toBe("ต้องเรียนบท 03, 04 ให้เสร็จก่อน");
  });

  it("Scenario 6: Session calculation and history integrity", () => {
    const sessions: StudySession[] = [
      {
        id: "s1",
        workspace_id: "ws-1",
        plan_item_id: "item-1",
        subject: "Math",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: null,
        course_code: null,
        session_date: "2026-08-31",
        start_time: "08:00",
        end_time: "08:50",
        duration_minutes: 50,
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
        created_at: "2026-08-31T08:50:00Z",
        updated_at: "2026-08-31T08:50:00Z",
      },
      {
        id: "s2",
        workspace_id: "ws-1",
        plan_item_id: "item-2",
        subject: "Physics",
        source_activity_id: null,
        assessment_source_external_id: null,
        activity_type: null,
        course_code: null,
        session_date: "2026-08-31",
        start_time: "09:00",
        end_time: "09:40",
        duration_minutes: 40,
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
        created_at: "2026-08-31T09:40:00Z",
        updated_at: "2026-08-31T09:40:00Z",
      },
    ];

    const totalMinutes = actualMinutesFromSessions(sessions);
    expect(totalMinutes).toBe(90);

    const status1 = statusFromActualMinutes(50, 100);
    expect(status1).toBe("studying");

    const status2 = statusFromActualMinutes(100, 100);
    expect(status2).toBe("completed");
  });
});
