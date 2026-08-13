import { describe, expect, it } from "vitest";
import { calculateCourseProgress, isYouTubeUrl, isValidHttpUrl } from "./courses";
import type { CourseLesson } from "@/types/db";

const lesson = (n: string): CourseLesson => ({ id: n, course_id: "c", external_id: n, lesson_number: n, title: n, section: null, order_index: null, lesson_url: null, source_type: null });

describe("courses", () => {
  it("calculates progress from real lesson numbers", () => {
    expect(calculateCourseProgress([lesson("001"), lesson("002"), lesson("003")], "002")).toEqual({ doneCount: 2, totalCount: 3, percent: 67 });
  });
  it("validates youtube and http urls", () => {
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://example.com")).toBe(false);
    expect(isValidHttpUrl("ftp://x.test")).toBe(false);
  });
});
