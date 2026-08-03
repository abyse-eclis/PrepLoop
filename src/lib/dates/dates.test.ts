import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  durationMinutes,
  formatDateKeyThai,
  isoWeekKey,
  isValidDateString,
  timeToMinutes,
  toBuddhistYear,
  validateIntervals,
} from "./index";

describe("durationMinutes", () => {
  it("computes 09:13-12:00 as 167 minutes", () => {
    expect(durationMinutes("09:13", "12:00")).toBe(167);
  });
  it("throws when end <= start", () => {
    expect(() => durationMinutes("12:00", "09:13")).toThrow();
    expect(() => durationMinutes("10:00", "10:00")).toThrow();
  });
  it("throws on invalid time", () => {
    expect(() => timeToMinutes("25:00")).toThrow();
    expect(() => timeToMinutes("9:13")).toThrow();
  });
});

describe("validateIntervals", () => {
  it("sums multiple non-overlapping intervals", () => {
    const r = validateIntervals([
      { start: "09:13", end: "10:10" }, // 57
      { start: "15:20", end: "15:55" }, // 35
      { start: "21:40", end: "22:15" }, // 35
    ]);
    expect(r.ok).toBe(true);
    expect(r.totalMinutes).toBe(127);
  });
  it("detects overlaps", () => {
    const r = validateIntervals([
      { start: "09:00", end: "10:00" },
      { start: "09:30", end: "10:30" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("ซ้อน"))).toBe(true);
  });
  it("rejects end<=start", () => {
    const r = validateIntervals([{ start: "10:00", end: "09:00" }]);
    expect(r.ok).toBe(false);
  });
  it("rejects empty", () => {
    expect(validateIntervals([]).ok).toBe(false);
  });
});

describe("date keys", () => {
  it("validates date strings", () => {
    expect(isValidDateString("2026-08-03")).toBe(true);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-8-3")).toBe(false);
  });
  it("adds days across month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("computes days between", () => {
    expect(daysBetween("2026-08-01", "2026-08-03")).toBe(2);
  });
  it("computes iso week key deterministically", () => {
    expect(isoWeekKey("2026-08-03")).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("buddhist year", () => {
  it("adds 543", () => {
    expect(toBuddhistYear(2026)).toBe(2569);
  });
  it("formats thai date with be", () => {
    expect(formatDateKeyThai("2026-08-03", { buddhist: true })).toBe(
      "3 ส.ค. 2569"
    );
    expect(formatDateKeyThai("2026-08-03")).toBe("3 ส.ค. 2026");
  });
});
