import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { recoveryPlanSchema, type RecoveryPlan } from "@/lib/schemas/recovery";
import { validateWithSchema } from "@/lib/schemas";
import { addDays } from "@/lib/dates";

export interface RecoveryContext {
  activePlanVersionId: string;
  effectiveFrom: string;
  dailyHourLimitMinutes: number;
  studyConstraints: Record<string, unknown>;
  examDates: Array<{ name: string; date: string }>;
  completedLessons: string[];
  notYetLearnedLessons: string[];
  pendingPlanItems: Array<{
    stableExternalId: string;
    subject: string;
    courseCode?: string | null;
    lessonFrom?: string | null;
    lessonTo?: string | null;
    activityType: string;
    assessmentSourceId?: string | null;
    targetMinutes: number;
    priority: string;
    instructions?: string | null;
    resourceUrl?: string | null;
    resourceLabel?: string | null;
    reviewReferenceIds?: string[] | null;
    metadata?: Record<string, unknown> | null;
    date: string;
  }>;
  overdueReviews: Array<{ subject: string | null; dueDate: string; reason: string | null }>;
  weakTopics: string[];
  failedAssessments: Array<{ subject: string | null; percentage: number | null }>;
  repeatedErrorTypes: string[];
  recentStudyMinutes: number;
}

const SYSTEM_PROMPT = `คุณคือผู้ช่วยวางแผนการเรียนแบบ Recovery สำหรับผู้เรียนคนเดียว
กฎเหล็ก:
- ห้ามแก้ไข plan version เดิม ให้สร้าง Recovery Plan ใหม่เท่านั้น
- ต้องตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนอก JSON
- ห้ามให้เนื้อหาบทเรียนที่ผู้เรียนยังไม่ได้เรียน (ใช้เฉพาะ completedLessons)
- ห้ามเพิ่มภาระเกิน dailyHourLimit โดยไม่มีเหตุผลชัดเจน
- ต้องจัดลำดับสิ่งที่ต้องทำทันที สิ่งที่เลื่อน ลด หรือรวมได้
- ต้องเพิ่มงานอุดจุดอ่อนอย่างมีขอบเขต
- ต้องรักษารอบทบทวนสำคัญ
- ต้องอธิบาย evidence และ reason อย่างชัดเจน

รูปแบบ JSON ที่ต้องตอบ:
{
  "schemaVersion": "1.0",
  "parentPlanVersionId": string,
  "effectiveFrom": "YYYY-MM-DD",
  "generatedBy": "claude_recovery",
  "reason": string,
  "evidence": [{ "type": string, "value": number|string, "threshold": number|string }],
  "weakSubjects": string[],
  "weakTopics": string[],
  "changes": [{ "action": "postpone"|"reduce"|"remove"|"add"|"merge"|"keep", "sourceItemExternalId"?: string, "reason": string }],
  "days": [{ "date": "YYYY-MM-DD", "targetMinutes": number, "napTargetMinutes"?: number, "notes"?: string, "items": [{ "stableExternalId": string, "subject": string, "courseCode"?: string, "lessonFrom"?: string, "lessonTo"?: string, "activityType": "course"|"review"|"diagnostic"|"quiz"|"exercise"|"mock"|"rest"|"other", "targetMinutes": number, "priority": "high"|"medium"|"low", "instructions": string }] }],
  "addedReviews": string[],
  "postponedItems": string[],
  "reducedItems": string[],
  "removedLowPriorityItems": string[],
  "riskNotes": string[]
}`;

export interface RecoveryOutcome {
  mode: "ai" | "mock";
  plan: RecoveryPlan;
  note?: string;
}

/**
 * Generate a recovery plan. Uses Claude when ANTHROPIC_API_KEY is set,
 * otherwise returns a deterministic mock plan clearly labelled as mock.
 */
export async function generateRecoveryPlan(
  ctx: RecoveryContext
): Promise<RecoveryOutcome> {
  const env = serverEnv();
  if (!env.anthropicApiKey) {
    return { mode: "mock", ...buildMockRecovery(ctx) };
  }

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const message = await client.messages.create({
      model: env.anthropicRecoveryModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `นี่คือบริบท (structured JSON) โปรดสร้าง Recovery Plan:\n${JSON.stringify(
            ctx,
            null,
            2
          )}`,
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const json = extractJson(text);
    const parsed = validateWithSchema(json, recoveryPlanSchema);
    if (!parsed.ok || !parsed.data) {
      // Fall back to mock but note the validation failure.
      const mock = buildMockRecovery(ctx);
      return {
        mode: "mock",
        plan: mock.plan,
        note: `การตอบกลับของ AI ไม่ผ่าน schema — ใช้ mock แทน (${parsed.issues
          .map((i) => `${i.path}: ${i.message}`)
          .join("; ")})`,
      };
    }
    return { mode: "ai", plan: parsed.data };
  } catch (e) {
    const mock = buildMockRecovery(ctx);
    return {
      mode: "mock",
      plan: mock.plan,
      note: `เรียก Anthropic ไม่สำเร็จ ใช้ mock แทน: ${(e as Error).message}`,
    };
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("ไม่พบ JSON ในคำตอบ");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

/** Deterministic, rule-based recovery for development / no-key mode. */
export function buildMockRecovery(ctx: RecoveryContext): {
  plan: RecoveryPlan;
  note: string;
} {
  const day1 = ctx.effectiveFrom;
  const day2 = addDays(ctx.effectiveFrom, 1);

  // Prioritise pending high-priority items and weak topics; cap at daily limit.
  const highPending = ctx.pendingPlanItems
    .filter((i) => i.priority === "high")
    .slice(0, 3);

  const items = highPending.map((i, idx) => ({
    stableExternalId: `recovery-${day1}-${i.stableExternalId}-${idx}`,
    subject: i.subject,
    courseCode: i.courseCode ?? null,
    lessonFrom: null,
    lessonTo: null,
    activityType: "review" as const,
    targetMinutes: Math.min(60, i.targetMinutes),
    priority: "high" as const,
    instructions:
      "ทบทวนงานค้างสำคัญก่อน ทำข้อที่เคยผิดใหม่ และอธิบายวิธีคิดโดยไม่เปิดเฉลย",
    reviewReferenceIds: [],
  }));

  if (items.length === 0) {
    items.push({
      stableExternalId: `recovery-${day1}-catchup`,
      subject: ctx.weakTopics[0] ?? "ทบทวนรวม",
      courseCode: null,
      lessonFrom: null,
      lessonTo: null,
      activityType: "review" as const,
      targetMinutes: 45,
      priority: "high" as const,
      instructions: "ทบทวนหัวข้อที่อ่อนและสรุปหลักคิดจากความจำ",
      reviewReferenceIds: [],
    });
  }

  const plan: RecoveryPlan = {
    schemaVersion: "1.0",
    parentPlanVersionId: ctx.activePlanVersionId,
    effectiveFrom: ctx.effectiveFrom,
    generatedBy: "claude_recovery",
    reason:
      "โหมด mock: จัดลำดับงานค้างสำคัญและอุดจุดอ่อน โดยไม่เกินเวลาต่อวันที่กำหนด",
    evidence: [
      {
        type: "recent_study_minutes",
        value: ctx.recentStudyMinutes,
        threshold: ctx.dailyHourLimitMinutes,
      },
      { type: "overdue_reviews", value: ctx.overdueReviews.length },
    ],
    weakSubjects: Array.from(
      new Set(ctx.failedAssessments.map((a) => a.subject ?? "").filter(Boolean))
    ),
    weakTopics: ctx.weakTopics,
    changes: [
      ...ctx.pendingPlanItems
        .filter((i) => i.priority === "low")
        .slice(0, 2)
        .map((i) => ({
          action: "postpone" as const,
          sourceItemExternalId: i.stableExternalId,
          reason: "งานความสำคัญต่ำ เลื่อนออกไปเพื่อโฟกัสงานสำคัญ",
        })),
    ],
    days: [
      {
        date: day1,
        targetMinutes: Math.min(
          ctx.dailyHourLimitMinutes,
          items.reduce((s, i) => s + i.targetMinutes, 0) + 45
        ),
        napTargetMinutes: 30,
        notes: "โฟกัสงานค้างสำคัญและจุดอ่อน",
        items,
      },
      {
        date: day2,
        targetMinutes: Math.min(ctx.dailyHourLimitMinutes, 120),
        napTargetMinutes: 30,
        notes: "ทบทวนซ้ำและทำโจทย์รูปแบบเดียวกันเพิ่ม",
        items: [
          {
            stableExternalId: `recovery-${day2}-reinforce`,
            subject: items[0]?.subject ?? "ทบทวนรวม",
            courseCode: null,
            lessonFrom: null,
            lessonTo: null,
            activityType: "review",
            targetMinutes: 60,
            priority: "medium",
            instructions: "ทำโจทย์รูปแบบเดียวกันเพิ่มและบันทึกว่าทำได้เองหรือไม่",
            reviewReferenceIds: [],
          },
        ],
      },
    ],
    addedReviews: [],
    postponedItems: ctx.pendingPlanItems
      .filter((i) => i.priority === "low")
      .slice(0, 2)
      .map((i) => i.stableExternalId),
    reducedItems: [],
    removedLowPriorityItems: [],
    riskNotes: [
      "นี่คือแผนจากโหมด mock ไม่ใช่ AI จริง — ตรวจสอบก่อนยืนยันเสมอ",
    ],
  };

  return {
    plan,
    note: "ใช้ mock recovery (ไม่มี ANTHROPIC_API_KEY) — ไม่ใช่ AI จริง",
  };
}
