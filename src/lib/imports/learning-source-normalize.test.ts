import { describe, expect, it } from "vitest";
import { learningSourceCatalogSchema } from "@/lib/schemas/learning-source";
import { normalizeLearningSource, chunk } from "./learning-source-normalize";

function parse(raw: unknown) {
  const r = learningSourceCatalogSchema.safeParse(raw);
  if (!r.success) throw new Error("invalid test catalog: " + r.error.message);
  return r.data;
}

const base = {
  schemaVersion: "1.0",
  catalogName: "Test",
  courses: [
    {
      id: "course-k001",
      code: "K001",
      name: "Math",
      subject: "MATHEMATICS",
      lessons: [
        { id: "k001-1", lessonNumber: "001", title: "L1" },
        { id: "k001-2", lessonNumber: "002", title: "L2" },
      ],
    },
  ],
};

describe("normalizeLearningSource — deduplication", () => {
  it("removes duplicate lessons within one course (real conflict key)", () => {
    const cat = parse({
      ...base,
      courses: [
        {
          ...base.courses[0],
          lessons: [
            { id: "k001-1", lessonNumber: "001", title: "L1" },
            { id: "k001-1", lessonNumber: "001", title: "L1 (dup)" }, // same external id
            { id: "k001-2", lessonNumber: "002", title: "L2" },
          ],
        },
      ],
    });
    const norm = normalizeLearningSource(cat);
    expect(norm.lessons).toHaveLength(2);
    const report = norm.reports.find((r) => r.entity === "course_lessons")!;
    expect(report.duplicatesRemoved).toBe(1);
    // last-wins merge
    expect(norm.lessons.find((l) => l.externalId === "k001-1")!.title).toBe(
      "L1 (dup)"
    );
  });

  it("never emits two rows with the same conflict key", () => {
    const cat = parse({
      ...base,
      courses: [
        {
          ...base.courses[0],
          lessons: Array.from({ length: 5 }, () => ({
            id: "dup",
            lessonNumber: "001",
            title: "same",
          })),
        },
      ],
    });
    const norm = normalizeLearningSource(cat);
    const keys = norm.lessons.map((l) => `${l.courseExternalId}::${l.externalId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("dedupes duplicate assessment sources by external_id", () => {
    const cat = parse({
      ...base,
      assessmentSources: [
        { id: "a1", type: "quiz", subject: "MATHEMATICS", title: "A", sourceType: "generated_prompt" },
        { id: "a1", type: "quiz", subject: "MATHEMATICS", title: "A2", sourceType: "generated_prompt" },
      ],
    });
    const norm = normalizeLearningSource(cat);
    expect(norm.assessments).toHaveLength(1);
    expect(norm.assessments[0]!.title).toBe("A2"); // last wins
  });

  it("dedupes duplicate course codes with different metadata", () => {
    const cat = parse({
      ...base,
      courses: [
        base.courses[0],
        { ...base.courses[0], id: "course-k001-b", name: "Math (renamed)", lessons: [] },
      ],
    });
    const norm = normalizeLearningSource(cat);
    expect(norm.courses).toHaveLength(1);
    expect(norm.courses[0]!.name).toBe("Math (renamed)");
    const report = norm.reports.find((r) => r.entity === "courses")!;
    expect(report.duplicatesRemoved).toBe(1);
  });

  it("is idempotent: normalizing twice yields identical output", () => {
    const cat = parse(base);
    expect(normalizeLearningSource(cat)).toEqual(normalizeLearningSource(cat));
  });

  it("handles 1000+ lessons and chunks them for batching", () => {
    const lessons = Array.from({ length: 1200 }, (_, i) => ({
      id: `k001-${i}`,
      lessonNumber: String(i).padStart(4, "0"),
      title: `L${i}`,
    }));
    const cat = parse({
      ...base,
      courses: [{ ...base.courses[0], lessons }],
    });
    const norm = normalizeLearningSource(cat);
    expect(norm.lessons).toHaveLength(1200);
    const batches = chunk(norm.lessons, 400);
    expect(batches).toHaveLength(3);
    expect(batches.reduce((s, b) => s + b.length, 0)).toBe(1200);
  });

  it("derives subjects from courses without duplication", () => {
    const cat = parse({
      ...base,
      subjects: ["MATHEMATICS"],
      courses: [
        base.courses[0],
        { id: "c2", code: "K002", name: "M2", subject: "MATHEMATICS", lessons: [] },
      ],
    });
    const norm = normalizeLearningSource(cat);
    expect(norm.subjects.map((s) => s.code)).toEqual(["MATHEMATICS"]);
  });
});

describe("chunk", () => {
  it("splits arrays", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
