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

  it("preserves flat sourceActivityId, assessment scores, and local date", () => {
    const n = normalizeExecutionHistory(
      parse({
        ...base,
        records: [
          {
            date: "2026-08-01",
            startTime: "09:35",
            endTime: "09:55",
            durationMinutes: 20,
            subject: "A_LEVEL_MATH_1",
            activityType: "diagnostic",
            sourceActivityId: "2026-08-01-k001-002-006",
            assessmentSourceId: "assessment-alevel-math-m110",
            courseCode: "M110",
            score: 12,
            maxScore: 20,
            correct: 12,
            totalQuestions: 20,
          },
        ],
      })
    );

    expect(n.sessions[0]).toMatchObject({
      sessionDate: "2026-08-01",
      sourceActivityId: "2026-08-01-k001-002-006",
      assessmentSourceId: "assessment-alevel-math-m110",
      activityType: "diagnostic",
      courseCode: "M110",
      score: 12,
      maxScore: 20,
      correct: 12,
      totalQuestions: 20,
    });
  });

  it("keeps multiple sessions for one sourceActivityId when times differ", () => {
    const n = normalizeExecutionHistory(
      parse({
        ...base,
        records: [
          {
            date: "2026-08-01",
            subject: "MATHEMATICS",
            sourceActivityId: "2026-08-01-k001-002-006",
            startTime: "16:00",
            endTime: "17:15",
          },
          {
            date: "2026-08-01",
            subject: "MATHEMATICS",
            sourceActivityId: "2026-08-01-k001-002-006",
            startTime: "18:40",
            endTime: "18:50",
          },
          {
            date: "2026-08-01",
            subject: "MATHEMATICS",
            sourceActivityId: "2026-08-01-k001-002-006",
            startTime: "19:00",
            endTime: "19:15",
          },
        ],
      })
    );

    expect(n.sessions).toHaveLength(3);
    expect(n.totalMinutes).toBe(100);
    expect(n.duplicatesInFile).toBe(0);
  });
