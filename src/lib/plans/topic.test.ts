import { describe, expect, it } from "vitest";
import { lessonRangeText, planItemTopic, topicIsSubject } from "./topic";

describe("planItemTopic", () => {
  it("uses the topic when the plan defines one", () => {
    expect(
      planItemTopic({ topic: "การเคลื่อนที่แนวตรง", subject: "PHYSICS" })
    ).toBe("การเคลื่อนที่แนวตรง");
  });

  it("falls back to instructions for legacy items without a topic", () => {
    expect(
      planItemTopic({ instructions: "ทบทวน Tense", subject: "A_LEVEL_ENGLISH" })
    ).toBe("ทบทวน Tense");
  });

  it("falls back to the lesson range, then the subject", () => {
    expect(
      planItemTopic({ lesson_from: "032", lesson_to: "035", subject: "PHYSICS" })
    ).toBe("คลิป 032–035");
    expect(planItemTopic({ subject: "PHYSICS" })).toBe("ฟิสิกส์");
  });

  it("never returns an empty heading", () => {
    expect(planItemTopic({ topic: "   ", instructions: "" })).toBe("รายการเรียน");
  });

  it("keeps only the first line and truncates a very long topic", () => {
    expect(planItemTopic({ instructions: "บรรทัดแรก\nบรรทัดสอง" })).toBe(
      "บรรทัดแรก"
    );
    const long = "ก".repeat(120);
    expect(planItemTopic({ topic: long })).toHaveLength(90);
  });

  it("reports when the heading fell all the way back to the subject", () => {
    expect(topicIsSubject({ subject: "PHYSICS" })).toBe(true);
    expect(topicIsSubject({ subject: "PHYSICS", topic: "งานและพลังงาน" })).toBe(
      false
    );
  });

  it("collapses a single-clip range", () => {
    expect(lessonRangeText({ lesson_from: "032", lesson_to: "032" })).toBe(
      "คลิป 032"
    );
    expect(lessonRangeText({})).toBeNull();
  });
});
