import { describe, expect, it } from "vitest";
import {
  assessmentResult,
  daySummary,
  scoreTrend,
  taskCompletion,
  timeCompletion,
  validateAnswerCounts,
  weightedCompletion,
} from "./index";

describe("timeCompletion", () => {
  it("caps display at 100 and reports over minutes", () => {
    const r = timeCompletion(515, 480);
    expect(r.percent).toBe(100);
    expect(r.rawPercent).toBeGreaterThan(100);
    expect(r.overMinutes).toBe(35);
  });
  it("computes partial completion", () => {
    const r = timeCompletion(240, 480);
    expect(r.percent).toBe(50);
    expect(r.overMinutes).toBe(0);
  });
  it("handles zero target", () => {
    expect(timeCompletion(0, 0).percent).toBe(0);
    expect(timeCompletion(10, 0).percent).toBe(100);
  });
});

describe("taskCompletion", () => {
  it("computes percentage of completed", () => {
    expect(taskCompletion(3, 4)).toBe(75);
    expect(taskCompletion(0, 0)).toBe(0);
  });
});

describe("weightedCompletion", () => {
  it("weights high=3 medium=2 low=1", () => {
    // high done(3) + medium not(0) + low done(1) = 4 / (3+2+1=6) = 67
    const r = weightedCompletion([
      { priority: "high", completed: true },
      { priority: "medium", completed: false },
      { priority: "low", completed: true },
    ]);
    expect(r).toBe(67);
  });
  it("returns 0 for empty", () => {
    expect(weightedCompletion([])).toBe(0);
  });
});

describe("assessmentResult", () => {
  it("computes percentage and pass/fail", () => {
    const r = assessmentResult({
      score: 35,
      maxScore: 50,
      passingPercentage: 70,
      totalQuestions: 50,
      correct: 35,
      incorrect: 10,
      skipped: 5,
      durationMinutes: 60,
    });
    expect(r.percentage).toBe(70);
    expect(r.passed).toBe(true);
    expect(r.differenceFromPassing).toBe(0);
    expect(r.accuracy).toBeCloseTo(77.8, 1); // 35/(50-5)
    expect(r.averageTimePerQuestion).toBeCloseTo(1.2, 2);
  });
  it("marks fail below passing", () => {
    const r = assessmentResult({ score: 20, maxScore: 50, passingPercentage: 70 });
    expect(r.passed).toBe(false);
    expect(r.differenceFromPassing).toBeLessThan(0);
  });
});

describe("validateAnswerCounts", () => {
  it("rejects when sum exceeds total", () => {
    expect(
      validateAnswerCounts({ totalQuestions: 10, correct: 6, incorrect: 4, skipped: 2 }).ok
    ).toBe(false);
  });
  it("accepts consistent counts", () => {
    expect(
      validateAnswerCounts({ totalQuestions: 10, correct: 6, incorrect: 3, skipped: 1 }).ok
    ).toBe(true);
  });
});

describe("scoreTrend", () => {
  it("detects up/down/same/none", () => {
    expect(scoreTrend(80, 70)).toBe("up");
    expect(scoreTrend(60, 70)).toBe("down");
    expect(scoreTrend(70, 70)).toBe("same");
    expect(scoreTrend(70, null)).toBe("none");
  });
});

describe("daySummary", () => {
  it("aggregates items and minutes", () => {
    const r = daySummary({
      items: [
        { priority: "high", targetMinutes: 120, status: "completed" },
        { priority: "medium", targetMinutes: 60, status: "not_started" },
      ],
      actualMinutesByItem: [130, 0],
    });
    expect(r.targetMinutes).toBe(180);
    expect(r.actualMinutes).toBe(130);
    expect(r.completedItems).toBe(1);
    expect(r.pendingItems).toBe(1);
    expect(r.taskCompletionPercent).toBe(50);
    // weighted: high done(3)/ (3+2)=5 => 60
    expect(r.weightedCompletionPercent).toBe(60);
  });
});
