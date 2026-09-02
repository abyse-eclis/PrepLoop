import { describe, expect, it } from "vitest";
import { csvCell, toCsv, toCsvFile, CSV_BOM } from "@/lib/export/csv";
import {
  isExportRangeKind,
  resolveExportRange,
} from "@/lib/export/range";
import {
  exportFilename,
  isExportFormat,
  renderExport,
} from "@/lib/export/format";
import type { StudyExport } from "@/lib/export/types";

describe("csv writer", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("renders empty for null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-1+cmd|calc")).toBe("'-1+cmd|calc");
    expect(csvCell("-15")).toBe("-15");
    expect(csvCell(-15)).toBe("-15");
  });

  it("joins rows with CRLF and prefixes a BOM for Excel", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\r\n1,2");
    expect(toCsvFile(["a"], [["ก"]])).toBe(`${CSV_BOM}a\r\nก`);
  });
});

describe("export range", () => {
  const today = "2026-08-20"; // Thursday

  it("resolves a single day", () => {
    const r = resolveExportRange({ kind: "daily", today });
    expect(r.ok && r.range.start).toBe(today);
    expect(r.ok && r.range.end).toBe(today);
  });

  it("resolves the Monday..Sunday week", () => {
    const r = resolveExportRange({ kind: "weekly", today });
    expect(r.ok && r.range.start).toBe("2026-08-17");
    expect(r.ok && r.range.end).toBe("2026-08-23");
  });

  it("resolves the calendar month", () => {
    const r = resolveExportRange({ kind: "monthly", today });
    expect(r.ok && r.range.start).toBe("2026-08-01");
    expect(r.ok && r.range.end).toBe("2026-08-31");
  });

  it("requires both dates for a custom range", () => {
    const r = resolveExportRange({ kind: "custom", today, start: "2026-08-01" });
    expect(r.ok).toBe(false);
  });

  it("rejects a reversed custom range", () => {
    const r = resolveExportRange({
      kind: "custom",
      today,
      start: "2026-08-10",
      end: "2026-08-01",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a valid custom range", () => {
    const r = resolveExportRange({
      kind: "custom",
      today,
      start: "2026-08-01",
      end: "2026-08-10",
    });
    expect(r.ok && r.range.start).toBe("2026-08-01");
    expect(r.ok && r.range.end).toBe("2026-08-10");
  });

  it("spans the data bounds for 'all'", () => {
    const r = resolveExportRange({
      kind: "all",
      today,
      earliest: "2026-07-01",
      latest: "2026-09-30",
    });
    expect(r.ok && r.range.start).toBe("2026-07-01");
    expect(r.ok && r.range.end).toBe("2026-09-30");
  });

  it("falls back to today when the workspace has no data", () => {
    const r = resolveExportRange({ kind: "all", today });
    expect(r.ok && r.range.start).toBe(today);
    expect(r.ok && r.range.end).toBe(today);
  });

  it("validates range kinds", () => {
    expect(isExportRangeKind("weekly")).toBe(true);
    expect(isExportRangeKind("yearly")).toBe(false);
  });
});

function sampleExport(): StudyExport {
  return {
    meta: {
      app: "PrepLoop",
      generatedAt: "2026-08-20T00:00:00.000Z",
      workspaceName: "ws",
      timezone: "Asia/Bangkok",
      rangeKind: "daily",
      rangeLabel: "รายวัน · 20 ส.ค. 2569",
      start: "2026-08-20",
      end: "2026-08-20",
    },
    totals: {
      days: 1,
      studiedDays: 1,
      targetMinutes: 120,
      actualMinutes: 100,
      timePercent: 83,
      sessionCount: 1,
      planItems: 1,
      completedItems: 0,
      skippedItems: 0,
      assessmentCount: 0,
      minutesBySubject: [{ subject: "คณิต", minutes: 100 }],
    },
    days: [
      {
        date: "2026-08-20",
        weekKey: "2026-W34",
        monthKey: "2026-08",
        targetMinutes: 120,
        actualMinutes: 100,
        timePercent: 83,
        taskPercent: 0,
        weightedPercent: 0,
        totalItems: 1,
        completedItems: 0,
        pendingItems: 1,
        excludedItems: 0,
        sessionCount: 1,
        assessmentCount: 0,
      },
    ],
    sessions: [
      {
        id: "s1",
        date: "2026-08-20",
        weekKey: "2026-W34",
        monthKey: "2026-08",
        subject: "คณิต",
        courseCode: "MATH-1",
        activityType: "course",
        lessonFrom: "1",
        lessonTo: "2",
        startTime: "09:00",
        endTime: "10:40",
        durationMinutes: 100,
        status: "completed",
        note: "โน้ต, มีจุลภาค",
        planItemId: "p1",
        plannedDate: "2026-08-19",
        caughtUp: true,
      },
    ],
    planItems: [
      {
        id: "p1",
        plannedDate: "2026-08-19",
        weekKey: "2026-W34",
        monthKey: "2026-08",
        planVersion: "V1",
        planVersionNumber: 1,
        stableExternalId: "item-1",
        subject: "คณิต",
        courseCode: "MATH-1",
        activityType: "course",
        lessonFrom: "1",
        lessonTo: "2",
        priority: "high",
        targetMinutes: 120,
        actualMinutes: 100,
        status: "studying",
        executionState: "in_progress",
        instructions: null,
        resourceUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
        resourceLabel: "5 โครงสร้างประโยคพื้นฐาน",
      },
    ],
    assessments: [],
  };
}

describe("export formats", () => {
  it("names files from the range and format", () => {
    expect(exportFilename("csv-daily", "2026-08-20", "2026-08-20")).toBe(
      "preploop-daily-2026-08-20.csv"
    );
    expect(exportFilename("json", "2026-08-01", "2026-08-31")).toBe(
      "preploop-full-2026-08-01_2026-08-31.json"
    );
  });

  it("validates format ids", () => {
    expect(isExportFormat("csv-items")).toBe(true);
    expect(isExportFormat("xlsx")).toBe(false);
  });

  it("renders the daily sheet with one row per day", () => {
    const file = renderExport(sampleExport(), "csv-daily");
    const lines = file.body.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.startsWith(`${CSV_BOM}date,week,month`)).toBe(true);
    expect(lines[1]).toContain("2026-08-20,2026-W34,2026-08,120,100,83");
    expect(file.contentType).toContain("text/csv");
  });

  it("renders items sheet including resource_url and resource_label", () => {
    const file = renderExport(sampleExport(), "csv-items");
    const lines = file.body.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("resource_url,resource_label");
    expect(lines[1]).toContain("https://www.youtube.com/watch?v=GNGZrMu55Ko,5 โครงสร้างประโยคพื้นฐาน");
  });

  it("keeps the catch-up flag and escapes notes in the sessions sheet", () => {
    const body = renderExport(sampleExport(), "csv-sessions").body;
    expect(body).toContain('"โน้ต, มีจุลภาค"');
    expect(body).toContain("2026-08-19,true");
  });

  it("renders every section in the JSON file", () => {
    const file = renderExport(sampleExport(), "json");
    const parsed = JSON.parse(file.body) as StudyExport;
    expect(parsed.meta.app).toBe("PrepLoop");
    expect(parsed.days).toHaveLength(1);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.planItems).toHaveLength(1);
    expect(parsed.planItems[0]?.resourceUrl).toBe("https://www.youtube.com/watch?v=GNGZrMu55Ko");
    expect(parsed.planItems[0]?.resourceLabel).toBe("5 โครงสร้างประโยคพื้นฐาน");
    expect(parsed.totals.actualMinutes).toBe(100);
    expect(file.contentType).toContain("application/json");
  });

  it("renders a header-only sheet when a section is empty", () => {
    const body = renderExport(sampleExport(), "csv-assessments").body;
    expect(body.split("\r\n")).toHaveLength(1);
  });
});
