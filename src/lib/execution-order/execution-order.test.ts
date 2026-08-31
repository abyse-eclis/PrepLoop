import { describe, it, expect } from "vitest";
import {
  applyExecutionOrder,
  checkTaskPrerequisites,
  normalizeOrderedIds,
} from "./index";

describe("Execution Order Utilities", () => {
  describe("normalizeOrderedIds", () => {
    it("handles string array", () => {
      expect(normalizeOrderedIds(["id-1", "id-2"])).toEqual(["id-1", "id-2"]);
    });

    it("handles OrderedTaskRef array", () => {
      expect(
        normalizeOrderedIds([
          { id: "id-1", type: "plan_item" },
          { id: "id-2", type: "review_task" },
        ])
      ).toEqual(["id-1", "id-2"]);
    });

    it("handles null / undefined / empty", () => {
      expect(normalizeOrderedIds(null)).toEqual([]);
      expect(normalizeOrderedIds(undefined)).toEqual([]);
      expect(normalizeOrderedIds([])).toEqual([]);
    });
  });

  describe("applyExecutionOrder", () => {
    const items = [
      { id: "task-1", name: "Math 1" },
      { id: "task-2", name: "Physics 1" },
      { id: "task-3", name: "Chemistry 1" },
      { id: "task-4", name: "Biology 1" },
      { id: "task-5", name: "English 1" },
      { id: "task-6", name: "Thai 1" },
      { id: "task-7", name: "Social 1" },
      { id: "task-8", name: "Aptitude 1" },
    ];

    it("returns original items if customOrder is empty or null", () => {
      expect(applyExecutionOrder(items, null)).toEqual(items);
      expect(applyExecutionOrder(items, [])).toEqual(items);
    });

    it("reorders 8 tasks according to custom order", () => {
      const customOrder = [
        "task-8",
        "task-3",
        "task-1",
        "task-7",
        "task-2",
        "task-6",
        "task-5",
        "task-4",
      ];
      const reordered = applyExecutionOrder(items, customOrder);
      expect(reordered.map((i) => i.id)).toEqual(customOrder);
    });

    it("places new/unlisted items at the end preserving their original relative order", () => {
      const partialOrder = ["task-4", "task-2"];
      const reordered = applyExecutionOrder(items, partialOrder);
      expect(reordered.map((i) => i.id)).toEqual([
        "task-4",
        "task-2",
        "task-1",
        "task-3",
        "task-5",
        "task-6",
        "task-7",
        "task-8",
      ]);
    });

    it("handles items nested with .item.id property", () => {
      const nestedItems = items.map((i) => ({ item: { id: i.id }, name: i.name }));
      const reordered = applyExecutionOrder(nestedItems, ["task-3", "task-1"]);
      expect(reordered.map((i) => i.item.id)).toEqual([
        "task-3",
        "task-1",
        "task-2",
        "task-4",
        "task-5",
        "task-6",
        "task-7",
        "task-8",
      ]);
    });
  });

  describe("checkTaskPrerequisites", () => {
    it("allows tasks with no prerequisites", () => {
      const result = checkTaskPrerequisites({
        course_code: "MATH01",
        lesson_from: "01",
      });
      expect(result.isBlocked).toBe(false);
    });

    it("blocks assessment if required completed lessons are not completed", () => {
      const context = {
        completedLessonsByCourse: new Map([["MATH01", new Set(["01", "02"])]]),
        assessmentRequiredLessons: new Map([["quiz-math-1", ["01", "02", "03"]]]),
      };

      const result = checkTaskPrerequisites(
        {
          course_code: "MATH01",
          assessment_source_id: "quiz-math-1",
          activity_type: "quiz",
        },
        context
      );

      expect(result.isBlocked).toBe(true);
      expect(result.reason).toContain("03");
    });

    it("allows assessment when all required completed lessons are done", () => {
      const context = {
        completedLessonsByCourse: new Map([["MATH01", new Set(["01", "02", "03"])]]),
        assessmentRequiredLessons: new Map([["quiz-math-1", ["01", "02", "03"]]]),
      };

      const result = checkTaskPrerequisites(
        {
          course_code: "MATH01",
          assessment_source_id: "quiz-math-1",
          activity_type: "quiz",
        },
        context
      );

      expect(result.isBlocked).toBe(false);
    });

    it("blocks lesson if prerequisite lesson is not done", () => {
      const context = {
        completedLessonsByCourse: new Map([["PHYS01", new Set(["01"])]]),
        lessonPrerequisites: new Map([["03", ["02"]]]),
      };

      const result = checkTaskPrerequisites(
        {
          course_code: "PHYS01",
          lesson_from: "03",
          activity_type: "lecture",
        },
        context
      );

      expect(result.isBlocked).toBe(true);
      expect(result.reason).toContain("02");
    });
  });
});
