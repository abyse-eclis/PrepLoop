import { describe, expect, it } from "vitest";
import { diffPlans, summarizeDiff } from "./diff";
import { assertPlanVersionImmutable } from "./immutable";

const base = {
  days: [
    {
      date: "2026-08-01",
      items: [
        {
          stableExternalId: "a",
          subject: "MATH",
          activityType: "course" as const,
          targetMinutes: 60,
          priority: "high" as const,
          instructions: "",
          reviewReferenceIds: [],
        },
        {
          stableExternalId: "b",
          subject: "MATH",
          activityType: "review" as const,
          targetMinutes: 30,
          priority: "medium" as const,
          instructions: "",
          reviewReferenceIds: [],
        },
      ],
    },
  ],
};

describe("diffPlans", () => {
  it("detects added, removed, moved, changed", () => {
    const next = {
      days: [
        {
          date: "2026-08-02",
          items: [
            // a moved to 08-02 and targetMinutes changed
            { ...base.days[0]!.items[0]!, targetMinutes: 90 },
            // c added
            {
              stableExternalId: "c",
              subject: "PHY",
              activityType: "course" as const,
              targetMinutes: 45,
              priority: "low" as const,
              instructions: "",
              reviewReferenceIds: [],
            },
          ],
        },
      ],
    };
    const entries = diffPlans(base, next);
    const s = summarizeDiff(entries);
    expect(s.removed).toBe(1); // b removed
    expect(s.added).toBe(1); // c added
    expect(s.moved).toBe(1); // a moved
    expect(s.changed).toBe(1); // a changed target
  });
});

describe("assertPlanVersionImmutable", () => {
  it("throws for confirmed/active/archived versions", () => {
    expect(() => assertPlanVersionImmutable("active")).toThrow();
    expect(() => assertPlanVersionImmutable("archived")).toThrow();
    expect(() => assertPlanVersionImmutable("superseded")).toThrow();
  });
  it("allows edits only on draft", () => {
    expect(() => assertPlanVersionImmutable("draft")).not.toThrow();
  });
});
