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
