import { describe, expect, it } from "vitest";
import { detectImportType } from "./detect";

describe("detectImportType", () => {
  it("detects workspace_config", () => {
    expect(
      detectImportType({
        schemaVersion: "1.0",
        workspace: { name: "x", startDate: "2026-08-01", dailyTargetMinutes: 480 },
      })
    ).toBe("workspace_config");
  });

  it("detects learning_source via courses/catalogName", () => {
    expect(detectImportType({ catalogName: "c", courses: [] })).toBe(
      "learning_source"
    );
    expect(detectImportType({ assessmentSources: [] })).toBe("learning_source");
  });

  it("detects study_plan via days + date range", () => {
    expect(
      detectImportType({ name: "p", startDate: "2026-08-01", endDate: "2026-08-07", days: [] })
    ).toBe("study_plan");
  });

  it("detects execution_history via type marker or records[]", () => {
    expect(
      detectImportType({
        schemaVersion: "1.0-reference",
        type: "execution_history_reference",
        records: [],
      })
    ).toBe("execution_history");
    expect(detectImportType({ records: [{ date: "2026-08-01" }] })).toBe(
      "execution_history"
    );
  });

  it("does not confuse study_plan/learning_source with execution_history", () => {
    expect(
      detectImportType({ name: "p", startDate: "a", endDate: "b", days: [], records: [] })
    ).toBe("study_plan");
    expect(detectImportType({ courses: [], records: [] })).toBe("learning_source");
  });

  it("returns null for unknown / non-object", () => {
    expect(detectImportType(null)).toBeNull();
    expect(detectImportType(42)).toBeNull();
    expect(detectImportType({ foo: "bar" })).toBeNull();
    expect(detectImportType([])).toBeNull();
  });

  it("flags a type mismatch: catalog JSON selected as workspace_config", () => {
    const detected = detectImportType({ catalogName: "c", courses: [] });
    expect(detected).toBe("learning_source");
    expect(detected).not.toBe("workspace_config");
  });
});
