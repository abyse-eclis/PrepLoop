import { describe, expect, it } from "vitest";
import {
  buildCarryOver,
  carryOverDayLabel,
  isCarriedOver,
  remainingMinutes,
  type CarryOverCandidate,
} from "@/lib/carryover";

const read = (row: CarryOverCandidate) => row;

function candidate(
  overrides: Partial<CarryOverCandidate> = {}
): CarryOverCandidate {
  return {
    plannedDate: "2026-08-12",
    targetMinutes: 60,
    actualMinutes: 0,
    executionState: "overdue",
    ...overrides,
  };
}

describe("carry-over", () => {
  it("carries an untouched past item", () => {
    expect(isCarriedOver("overdue", "2026-08-12", "2026-08-13")).toBe(true);
  });

  it("carries a partially studied past item", () => {
    expect(isCarriedOver("in_progress", "2026-08-12", "2026-08-13")).toBe(true);
  });

  it("does not carry finished or cancelled items", () => {
    expect(isCarriedOver("completed_on_time", "2026-08-12", "2026-08-13")).toBe(
      false
    );
    expect(isCarriedOver("completed_late", "2026-08-12", "2026-08-13")).toBe(
      false
    );
    expect(isCarriedOver("cancelled", "2026-08-12", "2026-08-13")).toBe(false);
  });

  it("does not carry items planned for today or later", () => {
    expect(isCarriedOver("not_started", "2026-08-13", "2026-08-13")).toBe(false);
    expect(isCarriedOver("not_started", "2026-08-14", "2026-08-13")).toBe(false);
  });

  it("never reports negative remaining minutes", () => {
    expect(remainingMinutes(60, 90)).toBe(0);
    expect(remainingMinutes(60, 25)).toBe(35);
  });

  it("groups by planned date, oldest first, with per-day debt", () => {
    const summary = buildCarryOver(
      [
        candidate({ plannedDate: "2026-08-12", targetMinutes: 60, actualMinutes: 20 }),
        candidate({ plannedDate: "2026-08-10", targetMinutes: 90 }),
        candidate({ plannedDate: "2026-08-12", targetMinutes: 30 }),
        candidate({ plannedDate: "2026-08-11", executionState: "completed_late" }),
      ],
      "2026-08-13",
      read
    );

    expect(summary.groups.map((g) => g.date)).toEqual([
      "2026-08-10",
      "2026-08-12",
    ]);
    expect(summary.groups[0]!.daysLate).toBe(3);
    expect(summary.groups[0]!.remainingMinutes).toBe(90);
    expect(summary.groups[1]!.remainingMinutes).toBe(70);
    expect(summary.itemCount).toBe(3);
    expect(summary.remainingMinutes).toBe(160);
    expect(summary.oldestDate).toBe("2026-08-10");
    expect(summary.maxDaysLate).toBe(3);
  });

  it("returns an empty summary when nothing is owed", () => {
    const summary = buildCarryOver(
      [candidate({ executionState: "completed_on_time" })],
      "2026-08-13",
      read
    );
    expect(summary.itemCount).toBe(0);
    expect(summary.remainingMinutes).toBe(0);
    expect(summary.oldestDate).toBeNull();
  });

  it("labels staleness in Thai", () => {
    expect(carryOverDayLabel(1)).toBe("ค้างจากเมื่อวาน");
    expect(carryOverDayLabel(2)).toBe("ค้างจากเมื่อวานซืน");
    expect(carryOverDayLabel(5)).toBe("ค้างมาแล้ว 5 วัน");
  });
});
