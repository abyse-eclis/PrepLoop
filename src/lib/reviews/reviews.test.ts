import { describe, expect, it } from "vitest";
import { reviewBucket, reviewDueDate } from "./index";

describe("reviewDueDate", () => {
  it("same day returns base", () => {
    expect(reviewDueDate("same_day", "2026-08-03")).toBe("2026-08-03");
  });
  it("next day adds 1", () => {
    expect(reviewDueDate("next_day", "2026-08-03")).toBe("2026-08-04");
  });
  it("three/seven days", () => {
    expect(reviewDueDate("three_days", "2026-08-03")).toBe("2026-08-06");
    expect(reviewDueDate("seven_days", "2026-08-03")).toBe("2026-08-10");
  });
  it("weekly lands on a Sunday >= base", () => {
    // 2026-08-03 is Monday; end of ISO week is Sunday 2026-08-09
    expect(reviewDueDate("weekly", "2026-08-03")).toBe("2026-08-09");
  });
  it("monthly lands on last day of month", () => {
    expect(reviewDueDate("monthly", "2026-08-03")).toBe("2026-08-31");
    expect(reviewDueDate("monthly", "2026-02-10")).toBe("2026-02-28");
  });
});

describe("reviewBucket", () => {
  it("classifies overdue/today/upcoming", () => {
    expect(reviewBucket("2026-08-01", "2026-08-03")).toBe("overdue");
    expect(reviewBucket("2026-08-03", "2026-08-03")).toBe("today");
    expect(reviewBucket("2026-08-05", "2026-08-03")).toBe("upcoming");
  });
});
