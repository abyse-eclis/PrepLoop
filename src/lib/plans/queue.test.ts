import { describe, expect, it } from "vitest";
import {
  classifyQueueState,
  isQueueActionable,
  isQueueCompleted,
  isQueueExcluded,
  selectQueueIds,
} from "./queue";
import type { PlanItemStatus } from "@/lib/schemas/common";

describe("Progress-based Sequential Study Queue", () => {
  const items = [
    { id: "first", orderIndex: 1, scheduled: false },
    { id: "second", orderIndex: 2, scheduled: false },
    { id: "mock", orderIndex: 3, scheduled: true },
    { id: "third", orderIndex: 4, scheduled: false },
  ];

  it("keeps the same current item regardless of calendar date", () => {
    const status = new Map<string, PlanItemStatus>([["first", "studying"]]);
    expect(selectQueueIds(items, status)).toEqual(["first", "second", "third"]);
  });

  it("advances after completion and excludes fixed-date work", () => {
    const status = new Map<string, PlanItemStatus>([["first", "completed"]]);
    expect(selectQueueIds(items, status)).toEqual(["second", "third"]);
  });

  it("returns a completed item to current when completion is undone", () => {
    const status = new Map<string, PlanItemStatus>([["first", "not_started"]]);
    expect(selectQueueIds(items, status, 1)).toEqual(["first"]);
  });

  it("selects an old planned-date item and accepts legacy actionable statuses", () => {
    const legacy = Array.from({ length: 648 }, (_, index) => ({
      id: `item-${index + 1}`,
      orderIndex: index + 1,
      scheduled: false,
      plannedDate: "2024-01-01",
    }));
    const statuses = new Map<string, PlanItemStatus | string>([
      ["item-1", "done"],
      ["item-2", "completed"],
      ["item-3", "planned"],
    ]);
    expect(
      selectQueueIds(legacy, statuses as Map<string, PlanItemStatus>, 8)[0]
    ).toBe("item-3");
    expect(
      classifyQueueState({
        totalItems: 648,
        completedItems: 2,
        excludedItems: 0,
        candidateItems: 8,
      })
    ).toBe("ready");
  });

  it("does not call a non-completed plan completed when its query has no candidate", () => {
    expect(
      classifyQueueState({
        totalItems: 648,
        completedItems: 2,
        excludedItems: 0,
        candidateItems: 0,
      })
    ).toBe("inconsistent");
  });

  it("supports ahead-of-time studying while preserving sequential priority", () => {
    // User studies item #2 ahead of time and completes it, but #1 is still incomplete
    const planItems = [
      { id: "task-1", orderIndex: 1, scheduled: false },
      { id: "task-2", orderIndex: 2, scheduled: false },
      { id: "task-3", orderIndex: 3, scheduled: false },
    ];
    const statuses = new Map<string, PlanItemStatus>([
      ["task-1", "not_started"],
      ["task-2", "completed"],
      ["task-3", "not_started"],
    ]);

    // task-1 is still current (#1 candidate) and task-3 is upcoming (#2 candidate)
    const queue = selectQueueIds(planItems, statuses, 5);
    expect(queue[0]).toBe("task-1");
    expect(queue[1]).toBe("task-3");
  });

  it("identifies terminal and excluded statuses correctly", () => {
    expect(isQueueCompleted("completed")).toBe(true);
    expect(isQueueCompleted("done")).toBe(true);
    expect(isQueueCompleted("not_started")).toBe(false);

    expect(isQueueExcluded("cancelled")).toBe(true);
    expect(isQueueExcluded("skipped")).toBe(true);
    expect(isQueueExcluded("studying")).toBe(false);

    expect(isQueueActionable("studying")).toBe(true);
    expect(isQueueActionable("not_started")).toBe(true);
    expect(isQueueActionable("completed")).toBe(false);
    expect(isQueueActionable("skipped")).toBe(false);
  });
});
