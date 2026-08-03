import { describe, expect, it } from "vitest";
import { executionHistorySchema } from "@/lib/schemas/execution-history";
import { normalizeExecutionHistory } from "./execution-history-normalize";

function parse(raw: unknown) {
  const r = executionHistorySchema.safeParse(raw);
  if (!r.success) throw new Error("invalid: " + r.error.message);
  return r.data;
}

const base = {
  schemaVersion: "1.0-reference",
  type: "execution_history_reference",
  timezone: "Asia/Bangkok",
};

describe("normalizeExecutionHistory", () => {
  it("normalizes multiple days into sessions with computed duration", () => {
    const h = parse({
      ...base,
      records: [
        { date: "2026-08-01", subject: "MATH", startTime: "09:00", endTime: "10:30" },
        { date: "2026-08-02", subject: "PHY", startTime: "20:00", endTime: "21:00" },
      ],
    });
    const n = normalizeExecutionHistory(h);
    expect(n.sessions).toHaveLength(2);
    expect(n.dayCount).toBe(2);
    expect(n.totalMinutes).toBe(90 + 60);
    expect(n.sessions[0]!.durationMinutes).toBe(90);
  });

  it("computes cross-midnight session duration", () => {
    const h = parse({
      ...base,
      records: [{ date: "2026-08-01", startTime: "23:38", endTime: "00:50" }],
    });
    const n = normalizeExecutionHistory(h);
    expect(n.sessions[0]!.durationMinutes).toBe(72);
    expect(n.sessions[0]!.crossesMidnight).toBe(true);
  });

  it("dedupes identical records within the file", () => {
    const rec = { date: "2026-08-01", subject: "MATH", startTime: "09:00", endTime: "10:00" };
    const n = normalizeExecutionHistory(parse({ ...base, records: [rec, rec] }));
    expect(n.sessions).toHaveLength(1);
    expect(n.duplicatesInFile).toBe(1);
  });

  it("reports a record with no time info", () => {
    const n = normalizeExecutionHistory(
      parse({ ...base, records: [{ date: "2026-08-01", subject: "MATH" }] })
    );
    expect(n.sessions).toHaveLength(0);
    expect(n.issues).toHaveLength(1);
    expect(n.issues[0]!.field).toContain("startTime");
  });

  it("reports an invalid time range with the reason", () => {
    const n = normalizeExecutionHistory(
      parse({
        ...base,
        records: [{ date: "2026-08-01", startTime: "12:00", endTime: "09:00" }],
      })
    );
    expect(n.sessions).toHaveLength(0);
    expect(n.issues[0]!.recordIndex).toBe(0);
    expect(n.issues[0]!.date).toBe("2026-08-01");
  });

  it("supports multiple sessions per record", () => {
    const n = normalizeExecutionHistory(
      parse({
        ...base,
        records: [
          {
            date: "2026-08-01",
            subject: "MATH",
            sessions: [
              { startTime: "09:00", endTime: "10:00" },
              { startTime: "13:00", endTime: "13:30" },
            ],
          },
        ],
      })
    );
    expect(n.sessions).toHaveLength(2);
    expect(n.totalMinutes).toBe(90);
  });

  it("uses durationMinutes when no times are given", () => {
    const n = normalizeExecutionHistory(
      parse({ ...base, records: [{ date: "2026-08-01", durationMinutes: 45 }] })
    );
    expect(n.sessions).toHaveLength(1);
    expect(n.sessions[0]!.durationMinutes).toBe(45);
  });
});
