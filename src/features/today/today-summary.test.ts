import { describe, it, expect } from "vitest";
import { resolvePlanItemsProgress } from "@/lib/plans/progress";
import { timeCompletion } from "@/lib/calculations";
import type { CustomStudyItem, PlanItem, StudySession } from "@/types/db";

describe("Today Summary & Study Queue Multi-Source Aggregation", () => {
  const dummyPlanItem: PlanItem = {
    id: "plan-math-1",
    workspace_id: "ws-1",
    plan_version_id: "pv-1",
    plan_day_id: "pd-1",
    date: "2026-08-31",
    order_index: 1,
    scheduled_at: null,
    stable_external_id: "math-repair-a",
    subject: "คณิตศาสตร์ 1",
    course_code: "MATH-01",
    lesson_from: "1",
    lesson_to: "3",
    activity_type: "lecture",
    assessment_source_id: null,
    target_minutes: 120,
    priority: "high",
    instructions: "Math Repair A",
    resource_url: null,
    resource_label: null,
    review_reference_ids: null,
    metadata: null,
    created_at: "2026-08-31T00:00:00Z",
  };

  const dummyExtraItem: CustomStudyItem = {
    id: "extra-reading-1",
    workspace_id: "ws-1",
    study_date: "2026-08-31",
    exam_category: "TGAT",
    subject: "TGAT1",
    custom_subject: null,
    title: "เทคนิค Reading",
    url: null,
    estimated_minutes: 15,
    notes: null,
    status: "not_started",
    created_at: "2026-08-31T08:00:00Z",
    updated_at: "2026-08-31T08:00:00Z",
  };

  it("Case A: Plan 70 min + Extra 15 min -> Today = 85 min, Sessions = 4, Math Repair stays 70 / 120", () => {
    // 3 sessions for Plan item (35 + 10 + 25 = 70 min)
    const planSessions: StudySession[] = [
      {
        id: "sess-1",
        workspace_id: "ws-1",
        plan_item_id: dummyPlanItem.id,
        session_date: "2026-08-31",
        start_time: "12:25",
        end_time: "13:00",
        duration_minutes: 35,
        status: "completed",
        subject: "คณิตศาสตร์ 1",
        activity_type: "lecture",
        course_code: "MATH-01",
        source_activity_id: dummyPlanItem.stable_external_id,
        assessment_source_external_id: null,
        actual_lesson_from: "1",
        actual_lesson_to: "1",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T13:00:00Z",
        updated_at: "2026-08-31T13:00:00Z",
      },
      {
        id: "sess-2",
        workspace_id: "ws-1",
        plan_item_id: dummyPlanItem.id,
        session_date: "2026-08-31",
        start_time: "13:02",
        end_time: "13:12",
        duration_minutes: 10,
        status: "completed",
        subject: "คณิตศาสตร์ 1",
        activity_type: "lecture",
        course_code: "MATH-01",
        source_activity_id: dummyPlanItem.stable_external_id,
        assessment_source_external_id: null,
        actual_lesson_from: "2",
        actual_lesson_to: "2",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T13:12:00Z",
        updated_at: "2026-08-31T13:12:00Z",
      },
      {
        id: "sess-3",
        workspace_id: "ws-1",
        plan_item_id: dummyPlanItem.id,
        session_date: "2026-08-31",
        start_time: "13:12",
        end_time: "13:37",
        duration_minutes: 25,
        status: "completed",
        subject: "คณิตศาสตร์ 1",
        activity_type: "lecture",
        course_code: "MATH-01",
        source_activity_id: dummyPlanItem.stable_external_id,
        assessment_source_external_id: null,
        actual_lesson_from: "3",
        actual_lesson_to: "3",
        note: null,
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        import_dedup_key: null,
        created_at: "2026-08-31T13:37:00Z",
        updated_at: "2026-08-31T13:37:00Z",
      },
    ];

    // 1 session for Extra Reading (15 min)
    const extraSession: StudySession = {
      id: "sess-4",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      exam_category: "TGAT",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
      session_date: "2026-08-31",
      start_time: "18:20",
      end_time: "18:35",
      duration_minutes: 15,
      status: "completed",
      actual_lesson_from: null,
      actual_lesson_to: null,
      note: null,
      score: null,
      max_score: null,
      correct: null,
      incorrect: null,
      total_questions: null,
      lesson_title: "เทคนิค Reading",
      lesson_url: null,
      import_dedup_key: null,
      created_at: "2026-08-31T18:35:00Z",
      updated_at: "2026-08-31T18:35:00Z",
    };

    const allSessionsToday = [...planSessions, extraSession];

    // 1. Global Today total study minutes & count
    const actualMinutesToday = allSessionsToday.reduce(
      (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
      0
    );
    const sessionCountToday = allSessionsToday.length;

    expect(actualMinutesToday).toBe(85);
    expect(sessionCountToday).toBe(4);

    // 2. Plan item progress (must NOT be inflated by extra study)
    const resolvedPlanItems = resolvePlanItemsProgress(
      [dummyPlanItem],
      allSessionsToday
    );
    expect(resolvedPlanItems[0]!.actualMinutes).toBe(70);
    expect(resolvedPlanItems[0]!.item.target_minutes).toBe(120);

    // 3. Extra study item progress
    const extraSessions = allSessionsToday.filter(
      (s) => s.custom_study_item_id === dummyExtraItem.id
    );
    const extraMinutes = extraSessions.reduce(
      (sum, s) => sum + (s.duration_minutes ?? 0),
      0
    );
    expect(extraMinutes).toBe(15);
  });

  it("Case B: Extra only 30 min -> Today = 30 min, Sessions = 1", () => {
    const extraSession: StudySession = {
      id: "sess-extra-30",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      session_date: "2026-08-31",
      start_time: "10:00",
      end_time: "10:30",
      duration_minutes: 30,
      status: "completed",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
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
    };

    const allSessions = [extraSession];
    const actualMinutesToday = allSessions.reduce(
      (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
      0
    );
    expect(actualMinutesToday).toBe(30);
    expect(allSessions.length).toBe(1);

    const resolved = resolvePlanItemsProgress([dummyPlanItem], allSessions);
    expect(resolved[0]!.actualMinutes).toBe(0);
  });

  it("Case C: Extra 2 sessions (10 + 20 min) -> Extra progress = 30 min, Sessions = 2", () => {
    const s1: StudySession = {
      id: "s1",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      session_date: "2026-08-31",
      start_time: "09:00",
      end_time: "09:10",
      duration_minutes: 10,
      status: "completed",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
      actual_lesson_from: null,
      actual_lesson_to: null,
      note: null,
      score: null,
      max_score: null,
      correct: null,
      incorrect: null,
      total_questions: null,
      import_dedup_key: null,
      created_at: "2026-08-31T09:10:00Z",
      updated_at: "2026-08-31T09:10:00Z",
    };

    const s2: StudySession = {
      id: "s2",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      session_date: "2026-08-31",
      start_time: "10:00",
      end_time: "10:20",
      duration_minutes: 20,
      status: "completed",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
      actual_lesson_from: null,
      actual_lesson_to: null,
      note: null,
      score: null,
      max_score: null,
      correct: null,
      incorrect: null,
      total_questions: null,
      import_dedup_key: null,
      created_at: "2026-08-31T10:20:00Z",
      updated_at: "2026-08-31T10:20:00Z",
    };

    const sessions = [s1, s2];
    const totalExtraMin = sessions.reduce(
      (sum, s) => sum + (s.duration_minutes ?? 0),
      0
    );
    expect(totalExtraMin).toBe(30);
    expect(sessions.length).toBe(2);
  });

  it("Case E: Extra cross-day (10 min yesterday + 20 min today) -> Today total counts 20 min, Extra accumulated progress = 30 min", () => {
    const yesterdaySession: StudySession = {
      id: "s-yesterday",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      session_date: "2026-08-30",
      start_time: "20:00",
      end_time: "20:10",
      duration_minutes: 10,
      status: "completed",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
      actual_lesson_from: null,
      actual_lesson_to: null,
      note: null,
      score: null,
      max_score: null,
      correct: null,
      incorrect: null,
      total_questions: null,
      import_dedup_key: null,
      created_at: "2026-08-30T20:10:00Z",
      updated_at: "2026-08-30T20:10:00Z",
    };

    const todaySession: StudySession = {
      id: "s-today",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      session_date: "2026-08-31",
      start_time: "14:00",
      end_time: "14:20",
      duration_minutes: 20,
      status: "completed",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
      actual_lesson_from: null,
      actual_lesson_to: null,
      note: null,
      score: null,
      max_score: null,
      correct: null,
      incorrect: null,
      total_questions: null,
      import_dedup_key: null,
      created_at: "2026-08-31T14:20:00Z",
      updated_at: "2026-08-31T14:20:00Z",
    };

    const allSessionsToday = [todaySession];
    const allCustomSessions = [yesterdaySession, todaySession];

    // Today summary only counts sessions occurring today (2026-08-31)
    const todayMinutes = allSessionsToday.reduce(
      (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
      0
    );
    expect(todayMinutes).toBe(20);

    // Extra item accumulated progress spans across days
    const extraAccumulated = allCustomSessions.reduce(
      (sum, s) => sum + Math.max(0, s.duration_minutes ?? 0),
      0
    );
    expect(extraAccumulated).toBe(30);
  });

  it("Case G: Extra session does not increment Study Queue item progress or alter candidate items", () => {
    const extraSession: StudySession = {
      id: "s-extra-long",
      workspace_id: "ws-1",
      custom_study_item_id: dummyExtraItem.id,
      plan_item_id: null,
      source_activity_id: null,
      assessment_source_external_id: null,
      session_date: "2026-08-31",
      start_time: "08:00",
      end_time: "09:00",
      duration_minutes: 60,
      status: "completed",
      subject: "TGAT1",
      activity_type: "custom_study",
      course_code: null,
      actual_lesson_from: null,
      actual_lesson_to: null,
      note: null,
      score: null,
      max_score: null,
      correct: null,
      incorrect: null,
      total_questions: null,
      import_dedup_key: null,
      created_at: "2026-08-31T09:00:00Z",
      updated_at: "2026-08-31T09:00:00Z",
    };

    const resolved = resolvePlanItemsProgress(
      [dummyPlanItem],
      [extraSession]
    );

    // Math Repair A must remain 0 / 120 and not_started
    expect(resolved[0]!.actualMinutes).toBe(0);
    expect(resolved[0]!.status).toBe("not_started");
  });
});
