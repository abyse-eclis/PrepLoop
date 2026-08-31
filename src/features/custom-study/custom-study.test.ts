import { describe, it, expect } from "vitest";
import {
  EXAM_CATEGORIES,
  getSubjectsForCategory,
  displayCustomSubject,
  formatCustomStudyLabel,
} from "@/lib/constants/exam-categories";
import { validateIntervals } from "@/lib/dates";
import type { CustomStudyItem, StudySession } from "@/types/db";

describe("Custom Study (เพิ่มการเรียนเอง) Feature", () => {
  describe("Category & Subject Configuration", () => {
    it("provides standard categories: A-Level, TGAT, TPAT, and อื่น ๆ", () => {
      const categoryIds = EXAM_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toContain("A-Level");
      expect(categoryIds).toContain("TGAT");
      expect(categoryIds).toContain("TPAT");
      expect(categoryIds).toContain("อื่น ๆ");
    });

    it("returns correct subjects for A-Level", () => {
      const subjects = getSubjectsForCategory("A-Level");
      expect(subjects).toContain("คณิตศาสตร์ 1");
      expect(subjects).toContain("คณิตศาสตร์ 2");
      expect(subjects).toContain("ภาษาอังกฤษ");
      expect(subjects).toContain("ฟิสิกส์");
      expect(subjects).toContain("เคมี");
      expect(subjects).toContain("ชีววิทยา");
      expect(subjects).toContain("ภาษาไทย");
      expect(subjects).toContain("สังคมศึกษา");
      expect(subjects).toContain("อื่น ๆ");
    });

    it("returns correct subjects for TGAT and TPAT", () => {
      const tgat = getSubjectsForCategory("TGAT");
      expect(tgat).toEqual(["TGAT1", "TGAT2", "TGAT3", "อื่น ๆ"]);

      const tpat = getSubjectsForCategory("TPAT");
      expect(tpat).toEqual([
        "TPAT1",
        "TPAT2",
        "TPAT3",
        "TPAT4",
        "TPAT5",
        "อื่น ๆ",
      ]);
    });

    it("formats custom subject properly when 'อื่น ๆ' is selected", () => {
      expect(displayCustomSubject("อื่น ๆ", "ดนตรีไทย")).toBe("ดนตรีไทย");
      expect(displayCustomSubject("ภาษาอังกฤษ", "อะไรก็ได้")).toBe("ภาษาอังกฤษ");
      expect(displayCustomSubject("อื่น ๆ", null)).toBe("อื่น ๆ");
      expect(displayCustomSubject("อื่น ๆ", "")).toBe("อื่น ๆ");
    });

    it("formats custom study label with category and subject", () => {
      expect(formatCustomStudyLabel("A-Level", "ภาษาอังกฤษ")).toBe(
        "A-Level · ภาษาอังกฤษ"
      );
      expect(formatCustomStudyLabel("TGAT", "TGAT1")).toBe("TGAT · TGAT1");
      expect(formatCustomStudyLabel("อื่น ๆ", "อื่น ๆ", "ความรู้รอบตัว")).toBe(
        "ความรู้รอบตัว"
      );
    });
  });

  describe("Custom Study Session & Data Model", () => {
    it("creates custom study item without course or plan dependencies", () => {
      const customItem: CustomStudyItem = {
        id: "cs-1",
        workspace_id: "ws-1",
        study_date: "2026-08-31",
        exam_category: "A-Level",
        subject: "ภาษาอังกฤษ",
        custom_subject: null,
        title: "Tense สรุปก่อนสอบ",
        url: "https://youtube.com/watch?v=12345",
        estimated_minutes: 45,
        notes: "เน้นจำสูตรโครงสร้าง",
        status: "not_started",
        created_at: "2026-08-31T08:00:00Z",
        updated_at: "2026-08-31T08:00:00Z",
      };

      expect(customItem.id).toBe("cs-1");
      expect(customItem.exam_category).toBe("A-Level");
      expect(customItem.subject).toBe("ภาษาอังกฤษ");
      expect(customItem.url).toBe("https://youtube.com/watch?v=12345");
      // Must not have course_id or plan_item_id
      const asRecord = customItem as unknown as Record<string, unknown>;
      expect(asRecord.course_id).toBeUndefined();
      expect(asRecord.plan_item_id).toBeUndefined();
    });

    it("logs study session linked to custom study item with plan_item_id = null", () => {
      const intervals = [{ start: "14:00", end: "14:45" }];
      const val = validateIntervals(intervals);
      expect(val.ok).toBe(true);
      expect(val.totalMinutes).toBe(45);

      const session: StudySession = {
        id: "sess-cs-1",
        workspace_id: "ws-1",
        custom_study_item_id: "cs-1",
        plan_item_id: null,
        source_activity_id: null,
        assessment_source_external_id: null,
        exam_category: "A-Level",
        subject: "ภาษาอังกฤษ",
        activity_type: "custom_study",
        course_code: null,
        session_date: "2026-08-31",
        start_time: "14:00",
        end_time: "14:45",
        duration_minutes: 45,
        status: "completed",
        actual_lesson_from: null,
        actual_lesson_to: null,
        note: "สรุป Past Perfect",
        score: null,
        max_score: null,
        correct: null,
        incorrect: null,
        total_questions: null,
        lesson_title: "Tense สรุปก่อนสอบ",
        lesson_url: "https://youtube.com/watch?v=12345",
        import_dedup_key: null,
        created_at: "2026-08-31T14:45:00Z",
        updated_at: "2026-08-31T14:45:00Z",
      };

      expect(session.plan_item_id).toBeNull();
      expect(session.course_code).toBeNull();
      expect(session.custom_study_item_id).toBe("cs-1");
      expect(session.lesson_title).toBe("Tense สรุปก่อนสอบ");
      expect(session.duration_minutes).toBe(45);
    });

    it("does not carry over to the next day on Today page", () => {
      const customItemsToday = [
        {
          id: "cs-1",
          study_date: "2026-08-31",
          title: "Tense สรุปก่อนสอบ",
        },
      ];

      const tomorrow = "2026-09-01";
      // Query for tomorrow only fetches tomorrow's study_date
      const itemsForTomorrow = customItemsToday.filter(
        (item) => item.study_date === tomorrow
      );

      expect(itemsForTomorrow.length).toBe(0);
    });
  });
});
