import { describe, expect, it } from "vitest";
import {
  applySessionPatch,
  buildCustomSessionVM,
  buildLessonLookup,
  buildPlanSessionVM,
  detectResourceKind,
  groupStudyQueue,
  optimisticAddTime,
  optimisticStatus,
  orderStudyQueue,
  planStatusForAction,
  customStatusForAction,
  statusAfterAddingTime,
  summarizeStudyQueue,
  toSessionStatus,
  type StudySessionVM,
} from "./index";
import type { CustomStudyItem, PlanItem, StudySession } from "@/types/db";

function planItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: "p1",
    workspace_id: "ws",
    plan_version_id: "v1",
    plan_day_id: "d1",
    date: "2026-09-08",
    order_index: 3,
    scheduled_at: null,
    stable_external_id: "s1",
    subject: "MATHEMATICS",
    course_code: "K001",
    lesson_from: "001",
    lesson_to: "003",
    activity_type: "course",
    assessment_source_id: null,
    target_minutes: 60,
    priority: "high",
    instructions: "ทำโจทย์ท้ายคลิป",
    resource_url: null,
    resource_label: null,
    review_reference_ids: [],
    metadata: null,
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "sess",
    workspace_id: "ws",
    plan_item_id: "p1",
    subject: "MATHEMATICS",
    source_activity_id: "s1",
    assessment_source_external_id: null,
    activity_type: "course",
    course_code: "K001",
    session_date: "2026-09-08",
    start_time: "09:00",
    end_time: "09:30",
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
    created_at: "2026-09-08T09:30:00Z",
    updated_at: "2026-09-08T09:30:00Z",
    ...overrides,
  };
}

function customItem(overrides: Partial<CustomStudyItem> = {}): CustomStudyItem {
  return {
    id: "c1",
    workspace_id: "ws",
    study_date: "2026-09-08",
    exam_category: "TGAT",
    subject: "TGAT1",
    custom_subject: null,
    title: "เทคนิค Reading",
    url: "https://youtu.be/abc",
    estimated_minutes: 30,
    notes: "ดูรอบเดียว",
    status: "not_started",
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
    ...overrides,
  };
}

function vm(overrides: Partial<StudySessionVM> = {}): StudySessionVM {
  return {
    key: "plan:x",
    source: { kind: "plan", id: "x" },
    subjectLabel: "คณิตศาสตร์",
    originLabel: "ตามแผน",
    title: "t",
    subtitle: null,
    instructions: null,
    plannedMinutes: 60,
    actualMinutes: 0,
    progressPercent: 0,
    status: "pending",
    rawStatus: "not_started",
    notes: null,
    history: [],
    completedAt: null,
    scheduledDate: "2026-09-08",
    order: 0,
    deferredAt: null,
    resource: null,
    missingResource: false,
    blockedReason: null,
    detailsHref: null,
    assessmentHref: null,
    editable: false,
    ...overrides,
  };
}

describe("status mapping", () => {
  it("maps both sources onto the same semantic statuses", () => {
    expect(toSessionStatus("not_started")).toBe("pending");
    expect(toSessionStatus("not_started", 10)).toBe("in_progress");
    expect(toSessionStatus("studying")).toBe("in_progress");
    expect(toSessionStatus("paused")).toBe("in_progress");
    expect(toSessionStatus("completed")).toBe("completed");
    expect(toSessionStatus("deferred")).toBe("deferred");
    expect(toSessionStatus("skipped")).toBe("skipped");
    expect(toSessionStatus("cancelled")).toBe("skipped");
  });

  it("accepts legacy imported values without crashing", () => {
    expect(toSessionStatus("done")).toBe("completed");
    expect(toSessionStatus("planned")).toBe("pending");
    expect(toSessionStatus(null)).toBe("pending");
    expect(toSessionStatus("weird")).toBe("in_progress");
  });

  it("keeps deferred and skipped distinct in both persisted models", () => {
    expect(planStatusForAction("deferred")).toBe("deferred");
    expect(planStatusForAction("skipped")).toBe("skipped");
    expect(customStatusForAction("deferred")).toBe("deferred");
    expect(customStatusForAction("skipped")).toBe("skipped");
    expect(planStatusForAction("pending")).toBe("not_started");
  });

  it("derives status after adding time with one rule for every source", () => {
    expect(statusAfterAddingTime("pending", 10, 60)).toBe("in_progress");
    expect(statusAfterAddingTime("deferred", 10, 60)).toBe("in_progress");
    expect(statusAfterAddingTime("skipped", 60, 60)).toBe("completed");
    expect(statusAfterAddingTime("completed", 5, 60)).toBe("completed");
    expect(statusAfterAddingTime("pending", 5, 0)).toBe("in_progress");
  });
});

describe("resource kinds", () => {
  it("classifies providers from the URL or catalog source type", () => {
    expect(detectResourceKind("https://smartmathpro.com/lesson/1")).toBe("smartmathpro");
    expect(detectResourceKind("https://www.youtube.com/watch?v=x")).toBe("youtube");
    expect(detectResourceKind("https://youtu.be/x")).toBe("youtube");
    expect(detectResourceKind("https://example.com/sheet.pdf")).toBe("document");
    expect(detectResourceKind("https://docs.google.com/document/d/1")).toBe("document");
    expect(detectResourceKind("https://example.com/", "SmartMathPro")).toBe("smartmathpro");
    expect(detectResourceKind("https://example.com/")).toBe("link");
  });
});

describe("view model builders", () => {
  it("builds a paid-course session with the catalog lesson title and SmartMathPro link", () => {
    const lessons = buildLessonLookup([
      {
        courseCode: "K001",
        lessonNumber: "001",
        title: "เซตและตรรกศาสตร์",
        lessonUrl: "https://smartmathpro.com/lesson/1",
        sourceType: "SmartMathPro",
      },
    ]);
    const built = buildPlanSessionVM({
      row: { item: planItem(), status: "studying", sessions: [session()], actualMinutes: 30 },
      order: 0,
      lessons,
      notes: "โน้ต",
    });
    expect(built.key).toBe("plan:p1");
    expect(built.title).toBe("เซตและตรรกศาสตร์");
    expect(built.subtitle).toContain("คอร์ส K001");
    expect(built.subtitle).toContain("คลิป 001–003");
    expect(built.status).toBe("in_progress");
    expect(built.progressPercent).toBe(50);
    expect(built.resource?.kind).toBe("smartmathpro");
    expect(built.resource?.label).toBe("เปิด SmartMathPro");
    expect(built.notes).toBe("โน้ต");
    expect(built.history).toHaveLength(1);
    expect(built.detailsHref).toBe("/plan?item=s1");
    expect(built.missingResource).toBe(false);
  });

  it("shows an explicit item URL for any subject but warns only for resource-enabled subjects", () => {
    const math = buildPlanSessionVM({
      row: {
        item: planItem({ resource_url: "https://smartmathpro.com/x", resource_label: "SmartMathPro" }),
        status: "not_started",
        sessions: [],
        actualMinutes: 0,
      },
      order: 0,
    });
    expect(math.resource?.kind).toBe("smartmathpro");
    expect(math.missingResource).toBe(false);

    const mathNoUrl = buildPlanSessionVM({
      row: { item: planItem(), status: "not_started", sessions: [], actualMinutes: 0 },
      order: 0,
    });
    expect(mathNoUrl.resource).toBeNull();
    expect(mathNoUrl.missingResource).toBe(false);

    const english = buildPlanSessionVM({
      row: {
        item: planItem({ subject: "A_LEVEL_ENGLISH", course_code: null, lesson_from: null }),
        status: "not_started",
        sessions: [],
        actualMinutes: 0,
      },
      order: 0,
    });
    expect(english.resource).toBeNull();
    expect(english.missingResource).toBe(true);
  });

  it("builds a free-course session with identical fields", () => {
    const built = buildCustomSessionVM({
      item: customItem(),
      sessions: [session({ id: "s-c", plan_item_id: null, custom_study_item_id: "c1", duration_minutes: 15 })],
      order: 5,
    });
    expect(built.key).toBe("custom:c1");
    expect(built.originLabel).toBe("เรียนเสริม");
    expect(built.resource?.kind).toBe("youtube");
    expect(built.resource?.label).toBe("เปิด YouTube");
    expect(built.plannedMinutes).toBe(30);
    expect(built.actualMinutes).toBe(15);
    expect(built.progressPercent).toBe(50);
    expect(built.status).toBe("in_progress");
    expect(built.notes).toBe("ดูรอบเดียว");
    expect(built.editable).toBe(true);
    expect(Object.keys(built).sort()).toEqual(
      Object.keys(
        buildPlanSessionVM({
          row: { item: planItem(), status: "not_started", sessions: [], actualMinutes: 0 },
          order: 0,
        })
      ).sort()
    );
  });
});

describe("queue ordering", () => {
  it("moves deferred sessions to the end while keeping them in today's plan", () => {
    const a = vm({ key: "a", order: 0 });
    const b = vm({ key: "b", order: 1, status: "deferred", deferredAt: "2026-09-08T10:00:00Z" });
    const c = vm({ key: "c", order: 2 });
    const d = vm({ key: "d", order: 3, status: "completed" });
    const e = vm({ key: "e", order: 4, status: "deferred", deferredAt: "2026-09-08T09:00:00Z" });
    const ordered = orderStudyQueue([a, b, c, d, e]).map((s) => s.key);
    expect(ordered).toEqual(["a", "c", "e", "b", "d"]);
    const groups = groupStudyQueue([a, b, c, d, e]);
    expect(groups.active.map((s) => s.key)).toEqual(["a", "c"]);
    expect(groups.deferred.map((s) => s.key)).toEqual(["e", "b"]);
    expect(groups.done.map((s) => s.key)).toEqual(["d"]);
  });

  it("summarizes without counting skipped sessions", () => {
    const summary = summarizeStudyQueue([
      vm({ key: "a", plannedMinutes: 60, actualMinutes: 60, status: "completed" }),
      vm({ key: "b", plannedMinutes: 30, actualMinutes: 10, status: "deferred" }),
      vm({ key: "c", plannedMinutes: 99, status: "skipped" }),
    ]);
    expect(summary).toEqual({
      totalSessions: 2,
      completedSessions: 1,
      remainingSessions: 1,
      deferredSessions: 1,
      plannedMinutes: 90,
      actualMinutes: 70,
    });
  });
});

describe("optimistic transitions", () => {
  it("adds time, reaches the target and completes", () => {
    const s = vm({ plannedMinutes: 60, actualMinutes: 40, status: "deferred", deferredAt: "x" });
    const patch = optimisticAddTime(s, [
      { id: "tmp", sessionDate: "2026-09-08", startTime: "10:00", endTime: "10:20", durationMinutes: 20, note: null },
    ]);
    expect(patch.actualMinutes).toBe(60);
    expect(patch.status).toBe("completed");
    expect(patch.progressPercent).toBe(100);
    expect(patch.deferredAt).toBeNull();
    expect(patch.history).toHaveLength(1);
  });

  it("defers, skips, completes and undoes", () => {
    const s = vm({ actualMinutes: 10, plannedMinutes: 60 });
    expect(optimisticStatus(s, "deferred", "now").status).toBe("deferred");
    expect(optimisticStatus(s, "deferred", "now").deferredAt).toBe("now");
    expect(optimisticStatus(s, "skipped", "now").status).toBe("skipped");
    expect(optimisticStatus(s, "completed", "now").completedAt).toBe("now");
    expect(optimisticStatus(s, "pending", "now").status).toBe("in_progress");
    expect(optimisticStatus(vm(), "pending", "now").status).toBe("pending");
  });

  it("patches only the targeted session", () => {
    const list = [vm({ key: "a" }), vm({ key: "b" })];
    const next = applySessionPatch(list, "b", { notes: "hi" });
    expect(next[0]!.notes).toBeNull();
    expect(next[1]!.notes).toBe("hi");
  });
});
