import { describe, expect, it } from "vitest";
import {
  deriveExecutionState,
  statusFromActualMinutes,
} from "@/lib/study-execution";

const baseSession = {
  duration_minutes: 60,
};

describe("study execution helpers", () => {
  it("derives completed_late without rewriting planned date", () => {
    expect(
      deriveExecutionState({
        plannedDate: "2026-08-12",
        today: "2026-08-13",
        status: "completed",
        targetMinutes: 60,
        sessions: [{ ...baseSession, session_date: "2026-08-13" }],
      })
    ).toBe("completed_late");
  });

  it("derives completed_early for learning ahead", () => {
    expect(
      deriveExecutionState({
        plannedDate: "2026-08-14",
        today: "2026-08-13",
        status: "completed",
        targetMinutes: 60,
        sessions: [{ ...baseSession, session_date: "2026-08-13" }],
      })
    ).toBe("completed_early");
  });

  it("reports a skipped item as skipped even with logged minutes", () => {
    expect(
      deriveExecutionState({
        plannedDate: "2026-08-12",
        today: "2026-08-13",
        status: "skipped",
        targetMinutes: 60,
        sessions: [{ ...baseSession, session_date: "2026-08-12" }],
      })
    ).toBe("skipped");
  });

  it("treats a past item ticked off today as completed_late", () => {
    expect(
      deriveExecutionState({
        plannedDate: "2026-08-12",
        today: "2026-08-13",
        status: "completed",
        targetMinutes: 60,
        sessions: [],
      })
    ).toBe("completed_late");
  });

  it("keeps an incomplete past plan item as overdue", () => {
    expect(
      deriveExecutionState({
        plannedDate: "2026-08-12",
        today: "2026-08-13",
        status: "not_started",
        targetMinutes: 60,
        sessions: [],
      })
    ).toBe("overdue");
  });

  it("allows over-target study time to remain completed", () => {
    expect(statusFromActualMinutes(560, 480)).toBe("completed");
  });

  it("recomputes deleted session totals back to not_started", () => {
    expect(statusFromActualMinutes(0, 60)).toBe("not_started");
  });
});

