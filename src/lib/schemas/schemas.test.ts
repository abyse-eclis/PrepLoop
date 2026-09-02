import { describe, expect, it } from "vitest";
import { parseJsonWithSchema, validateWithSchema } from "./index";
import { workspaceConfigSchema } from "./workspace-config";
import { learningSourceCatalogSchema } from "./learning-source";
import { planItemSchema, studyPlanSchema } from "./study-plan";
import { recoveryPlanSchema } from "./recovery";

const workspace = {
  schemaVersion: "1.0",
  workspace: {
    name: "แผนติว TCAS70",
    timezone: "Asia/Bangkok",
    startDate: "2026-08-01",
    dailyTargetMinutes: 480,
    napTargetMinutes: { min: 30, max: 60 },
  },
  examEvents: [
    { id: "exam-tgat", name: "TGAT", examType: "TGAT", date: "2027-01-30" },
  ],
};

const catalog = {
  schemaVersion: "1.0",
  catalogName: "TCAS70",
  courses: [
    {
      id: "course-k001",
      code: "K001",
      name: "ปรับพื้นคณิต",
      subject: "MATHEMATICS",
      lessons: [{ id: "k001-012", lessonNumber: "012", title: "คลิป 012" }],
    },
  ],
};

const plan = {
  schemaVersion: "1.0",
  name: "Demo Plan V1",
  startDate: "2026-08-01",
  endDate: "2026-08-03",
  generatedBy: "chatgpt",
  days: [
    {
      date: "2026-08-01",
      targetMinutes: 480,
      napTargetMinutes: 45,
      items: [
        {
          stableExternalId: "2026-08-01-k001-001",
          subject: "MATHEMATICS",
          courseCode: "K001",
          activityType: "course",
          targetMinutes: 120,
          priority: "high",
          instructions: "เรียนตามลำดับ",
        },
      ],
    },
  ],
};

describe("workspaceConfigSchema", () => {
  it("accepts valid config", () => {
    expect(validateWithSchema(workspace, workspaceConfigSchema).ok).toBe(true);
  });
  it("rejects nap max < min", () => {
    const bad = {
      ...workspace,
      workspace: {
        ...workspace.workspace,
        napTargetMinutes: { min: 60, max: 30 },
      },
    };
    const r = validateWithSchema(bad, workspaceConfigSchema);
    expect(r.ok).toBe(false);
  });
});

describe("learningSourceCatalogSchema", () => {
  it("accepts valid catalog with 003.1 lessonNumber", () => {
    const c = {
      ...catalog,
      courses: [
        {
          ...catalog.courses[0],
          lessons: [{ id: "x", lessonNumber: "003.1", title: "t" }],
        },
      ],
    };
    expect(validateWithSchema(c, learningSourceCatalogSchema).ok).toBe(true);
  });
});

describe("studyPlanSchema", () => {
  it("accepts valid plan", () => {
    expect(validateWithSchema(plan, studyPlanSchema).ok).toBe(true);
  });

  it("normalizes metadata.videoUrl fallback into resourceUrl", () => {
    const parsed = planItemSchema.parse({
      stableExternalId: "2026-08-01-krupone-noun",
      subject: "TGAT1",
      activityType: "review",
      targetMinutes: 60,
      priority: "medium",
      instructions: "ทบทวน Noun",
      metadata: { videoUrl: "https://www.youtube.com/watch?v=0nXxgts-RWc" },
    });

    expect(parsed.resourceUrl).toBe(
      "https://www.youtube.com/watch?v=0nXxgts-RWc"
    );
    expect(parsed.resourceLabel).toBe("เปิดลิงก์");
  });
  it("keeps old JSON import compatible when resourceUrl is missing", () => {
    const parsed = planItemSchema.parse({
      stableExternalId: "2026-08-01-old-json",
      subject: "TGAT1",
      activityType: "review",
      targetMinutes: 60,
      priority: "medium",
    });

    expect(parsed.resourceUrl).toBeUndefined();
  });

  it("accepts new JSON import with resourceUrl", () => {
    const parsed = planItemSchema.parse({
      stableExternalId: "2026-08-01-krupone-youtube",
      subject: "TGAT1",
      activityType: "review",
      targetMinutes: 60,
      priority: "medium",
      resourceUrl: "https://www.youtube.com/watch?v=0nXxgts-RWc",
      resourceLabel: "KruP’ONE OpenDurianTCAS",
    });

    expect(parsed.resourceUrl).toBe(
      "https://www.youtube.com/watch?v=0nXxgts-RWc"
    );
    expect(parsed.resourceLabel).toBe("KruP’ONE OpenDurianTCAS");
  });

  it("rejects non-http resourceUrl", () => {
    const r = planItemSchema.safeParse({
      stableExternalId: "2026-08-01-bad-link",
      subject: "TGAT1",
      activityType: "review",
      targetMinutes: 60,
      priority: "medium",
      resourceUrl: "javascript:alert(1)",
    });

    expect(r.success).toBe(false);
  });
  it("rejects endDate before startDate", () => {
    const r = validateWithSchema(
      { ...plan, endDate: "2026-07-01" },
      studyPlanSchema
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path.includes("endDate"))).toBe(true);
  });
  it("rejects duplicate stableExternalId", () => {
    const dup = {
      ...plan,
      days: [
        plan.days[0],
        { ...plan.days[0], date: "2026-08-02" },
      ],
    };
    expect(validateWithSchema(dup, studyPlanSchema).ok).toBe(false);
  });
  it("reports issue path on invalid json", () => {
    const r = parseJsonWithSchema("{ not json", studyPlanSchema);
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.path).toBe("(root)");
  });

  it("parses full study plan preserving resourceUrl, resourceLabel, and metadata", () => {
    const fullPlan = {
      schemaVersion: "1.0",
      name: "TCAS70 Study Plan — v7.1 English by Chris",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      generatedBy: "chatgpt",
      days: [
        {
          date: "2026-09-02",
          targetMinutes: 120,
          items: [
            {
              stableExternalId: "2026-09-02-alevel-english",
              subject: "A_LEVEL_ENGLISH",
              activityType: "course",
              targetMinutes: 60,
              priority: "high",
              instructions: "เรียน 5 โครงสร้างประโยคพื้นฐาน",
              resourceUrl: "https://www.youtube.com/watch?v=GNGZrMu55Ko",
              resourceLabel: "5 โครงสร้างประโยคพื้นฐาน",
              metadata: { course: "English by Chris" },
            },
          ],
        },
      ],
    };

    const res = validateWithSchema(fullPlan, studyPlanSchema);
    expect(res.ok).toBe(true);
    if (res.ok && res.data) {
      const item = res.data.days[0]!.items[0]!;
      expect(item.resourceUrl).toBe("https://www.youtube.com/watch?v=GNGZrMu55Ko");
      expect(item.resourceLabel).toBe("5 โครงสร้างประโยคพื้นฐาน");
      expect(item.metadata).toEqual({ course: "English by Chris" });
    }
  });
});

describe("recoveryPlanSchema", () => {
  it("validates recovery response", () => {
    const recovery = {
      schemaVersion: "1.0",
      parentPlanVersionId: "plan-version-1",
      effectiveFrom: "2026-08-04",
      generatedBy: "claude_recovery",
      reason: "ทำไม่ครบ",
      evidence: [{ type: "daily_completion", value: 62, threshold: 70 }],
      weakSubjects: ["MATHEMATICS"],
      changes: [
        {
          action: "postpone",
          sourceItemExternalId: "2026-08-03-k001-review",
          reason: "ยังไม่เสร็จ",
        },
      ],
      days: [
        {
          date: "2026-08-04",
          targetMinutes: 480,
          items: [
            {
              stableExternalId: "recovery-2026-08-04-k001",
              subject: "MATHEMATICS",
              activityType: "review",
              targetMinutes: 45,
              priority: "high",
              instructions: "ทำข้อที่เคยผิด",
            },
          ],
        },
      ],
    };
    expect(validateWithSchema(recovery, recoveryPlanSchema).ok).toBe(true);
  });
  it("rejects wrong generatedBy", () => {
    const r = validateWithSchema(
      { schemaVersion: "1.0", parentPlanVersionId: "x", effectiveFrom: "2026-08-04", generatedBy: "chatgpt", reason: "r" },
      recoveryPlanSchema
    );
    expect(r.ok).toBe(false);
  });
});
