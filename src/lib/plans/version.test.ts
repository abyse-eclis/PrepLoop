import { describe, expect, it } from "vitest";
import { selectVersionForDate, versionIdsByDate } from "@/lib/plans/version";

function version(overrides: Partial<Parameters<typeof selectVersionForDate>[0][number]> & { id: string }) {
  return {
    status: "active",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    effective_from: null,
    effective_to: null,
    version_number: 1,
    ...overrides,
  };
}

describe("selectVersionForDate", () => {
  const v1 = version({
    id: "v1",
    status: "superseded",
    version_number: 1,
    effective_from: "2026-08-01",
    effective_to: "2026-08-12",
  });
  const v2 = version({
    id: "v2",
    status: "active",
    version_number: 2,
    effective_from: "2026-08-13",
    effective_to: null,
  });

  it("keeps past dates on the version that was in effect then", () => {
    expect(selectVersionForDate([v1, v2], "2026-08-12")?.id).toBe("v1");
  });

  it("uses the newer version from its effective date on", () => {
    expect(selectVersionForDate([v1, v2], "2026-08-13")?.id).toBe("v2");
  });

  it("ignores versions that do not cover the date", () => {
    expect(selectVersionForDate([v1, v2], "2026-09-01")).toBeNull();
  });

  it("ignores archived versions", () => {
    const archived = version({ id: "old", status: "archived" });
    expect(selectVersionForDate([archived], "2026-08-05")).toBeNull();
  });

  it("falls back to a draft only when nothing else covers the date", () => {
    const draft = version({ id: "draft", status: "draft", version_number: 3 });
    expect(selectVersionForDate([draft], "2026-08-05")?.id).toBe("draft");
    expect(selectVersionForDate([draft, v1], "2026-08-05")?.id).toBe("v1");
  });

  it("maps each date to its owning version once", () => {
    const map = versionIdsByDate([v1, v2], [
      "2026-08-12",
      "2026-08-13",
      "2026-08-12",
    ]);
    expect(map.get("2026-08-12")).toBe("v1");
    expect(map.get("2026-08-13")).toBe("v2");
    expect(map.size).toBe(2);
  });
});
