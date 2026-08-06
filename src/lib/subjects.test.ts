import { describe, expect, it } from "vitest";
import { subjectLabel } from "./subjects";

describe("subjectLabel", () => {
  it("maps known subject codes to Thai labels", () => {
    expect(subjectLabel("MATHEMATICS")).toBe("คณิตศาสตร์");
    expect(subjectLabel("A_LEVEL_MATH_1")).toBe("A-Level คณิตศาสตร์ 1");
    expect(subjectLabel("TGAT2")).toBe("TGAT2 การคิดอย่างมีเหตุผล");
  });

  it("falls back to readable text", () => {
    expect(subjectLabel("CUSTOM_SUBJECT")).toBe("Custom Subject");
    expect(subjectLabel(null)).toBe("ไม่ระบุวิชา");
  });
});
