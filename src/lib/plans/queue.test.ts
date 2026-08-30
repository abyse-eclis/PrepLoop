import { describe, expect, it } from "vitest";
import { selectQueueIds } from "./queue";
import type { PlanItemStatus } from "@/lib/schemas/common";

describe("rolling study queue", () => {
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
});
