"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { assessmentResult, validateAnswerCounts } from "@/lib/calculations";
import { reviewDueDate, reviewRulesForEvent, DEFAULT_REVIEW_INSTRUCTIONS, REVIEW_RULE_LABELS } from "@/lib/reviews";
import { errorTypeEnum } from "@/lib/schemas/common";

export interface AttemptResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const attemptSchema = z.object({
  assessmentSourceId: z.string().uuid().nullable().optional(),
  planItemId: z.string().uuid().nullable().optional(),
  subject: z.string().min(1),
  attemptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  totalQuestions: z.number().int().min(0).optional(),
  correct: z.number().int().min(0).optional(),
  incorrect: z.number().int().min(0).optional(),
  skipped: z.number().int().min(0).optional(),
  guessed: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(0).optional(),
  passingPercentage: z.number().min(0).max(100),
  completedOnTime: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  topicErrors: z
    .array(
      z.object({
        topic: z.string().min(1),
        errorType: errorTypeEnum,
      })
    )
    .optional(),
});

export async function recordAttempt(
  input: z.infer<typeof attemptSchema>
): Promise<AttemptResult> {
  const parsed = attemptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const d = parsed.data;
  const workspace = await getActiveWorkspace();
  if (!workspace) return { ok: false, error: "ไม่พบ workspace" };

  if (
    typeof d.totalQuestions === "number" &&
    typeof d.correct === "number" &&
    typeof d.incorrect === "number" &&
    typeof d.skipped === "number"
  ) {
    const check = validateAnswerCounts({
      totalQuestions: d.totalQuestions,
      correct: d.correct,
      incorrect: d.incorrect,
      skipped: d.skipped,
    });
    if (!check.ok) return { ok: false, error: check.error };
  }

  const result = assessmentResult({
    score: d.score,
    maxScore: d.maxScore,
    totalQuestions: d.totalQuestions,
    correct: d.correct,
    incorrect: d.incorrect,
    skipped: d.skipped,
    durationMinutes: d.durationMinutes,
    passingPercentage: d.passingPercentage,
  });

  const supabase = await createServerSupabase();
  const { data: attemptRow, error } = await supabase
    .from("assessment_attempts")
    .insert({
      workspace_id: workspace.id,
      assessment_source_id: d.assessmentSourceId ?? null,
      plan_item_id: d.planItemId ?? null,
      subject: d.subject,
      attempt_date: d.attemptDate,
      score: d.score,
      max_score: d.maxScore,
      total_questions: d.totalQuestions ?? null,
      correct: d.correct ?? null,
      incorrect: d.incorrect ?? null,
      skipped: d.skipped ?? null,
      guessed: d.guessed ?? null,
      duration_minutes: d.durationMinutes ?? null,
      passing_percentage: d.passingPercentage,
      percentage: result.percentage,
      passed: result.passed,
      completed_on_time: d.completedOnTime ?? null,
      notes: d.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const attemptId = (attemptRow as { id: string }).id;

  // Topic errors: out_of_scope not counted as weakness.
  if (d.topicErrors && d.topicErrors.length > 0) {
    const topicRows = d.topicErrors.map((t) => ({
      workspace_id: workspace.id,
      attempt_id: attemptId,
      topic: t.topic,
      error_type: t.errorType,
      is_weakness: t.errorType !== "out_of_scope_question",
    }));
    await supabase.from("assessment_topic_results").insert(topicRows);

    const errorRows = d.topicErrors.map((t) => ({
      workspace_id: workspace.id,
      attempt_id: attemptId,
      subject: d.subject,
      topic: t.topic,
      error_type: t.errorType,
      out_of_scope: t.errorType === "out_of_scope_question",
    }));
    await supabase.from("error_logs").insert(errorRows);
  }

  // Auto-generate review tasks for the assessment event.
  const rules = reviewRulesForEvent("assessment_recorded");
  const reviewRows = rules.map((rule) => ({
    workspace_id: workspace.id,
    source_type: "assessment",
    source_ref: d.assessmentSourceId ?? attemptId,
    subject: d.subject,
    rule,
    due_date: reviewDueDate(rule, d.attemptDate),
    reason: result.passed
      ? `ทบทวนหลังทำข้อสอบ (${REVIEW_RULE_LABELS[rule]})`
      : `ไม่ผ่านเกณฑ์ ทบทวนจุดอ่อน (${REVIEW_RULE_LABELS[rule]})`,
    instructions: DEFAULT_REVIEW_INSTRUCTIONS,
    status: "pending",
  }));
  await supabase.from("review_tasks").insert(reviewRows);

  revalidatePath("/assessments");
  revalidatePath("/reviews");
  revalidatePath("/progress");
  return {
    ok: true,
    message: `บันทึกผลแล้ว: ${result.percentage}% (${
      result.passed ? "ผ่าน" : "ไม่ผ่าน"
    })`,
  };
}
