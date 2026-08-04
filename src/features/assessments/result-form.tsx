"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { recordAttempt } from "./actions";
import { assessmentResult, validateAnswerCounts } from "@/lib/calculations";
import { errorTypeEnum } from "@/lib/schemas/common";

const ERROR_TYPE_LABELS: Record<string, string> = {
  concept_misunderstanding: "เข้าใจแนวคิดผิด",
  formula_memory: "จำสูตรไม่ได้",
  reading_error: "อ่านโจทย์ผิด",
  calculation_error: "คำนวณผิด",
  wrong_method: "ใช้วิธีผิด",
  guessed: "เดา",
  too_slow: "ช้าเกินไป",
  careless: "ประมาท",
  not_learned: "ยังไม่ได้เรียน",
  out_of_scope_question: "นอกขอบเขต (ไม่นับจุดอ่อน)",
};

export function ResultForm({
  subject,
  assessmentSourceId,
  planItemId,
  passingPercentage,
  defaultDate,
  onDone,
}: {
  subject: string;
  assessmentSourceId?: string | null;
  planItemId?: string | null;
  passingPercentage: number;
  defaultDate: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    score: "",
    maxScore: "",
    totalQuestions: "",
    correct: "",
    incorrect: "",
    skipped: "",
    guessed: "",
    durationMinutes: "",
    notes: "",
    attemptDate: defaultDate,
  });
  const [topics, setTopics] = useState<
    Array<{ topic: string; errorType: string }>
  >([]);

  function num(v: string): number | undefined {
    if (v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  const score = num(f.score);
  const maxScore = num(f.maxScore);
  const preview =
    score !== undefined && maxScore !== undefined && maxScore > 0
      ? assessmentResult({ score, maxScore, passingPercentage })
      : null;

  function submit() {
    setError(null);
    const s = num(f.score);
    const ms = num(f.maxScore);
    if (s === undefined || ms === undefined || ms <= 0) {
      setError("กรุณากรอกคะแนนและคะแนนเต็มให้ถูกต้อง");
      return;
    }
    const tq = num(f.totalQuestions);
    const c = num(f.correct);
    const inc = num(f.incorrect);
    const sk = num(f.skipped);
    if (
      tq !== undefined &&
      c !== undefined &&
      inc !== undefined &&
      sk !== undefined
    ) {
      const check = validateAnswerCounts({
        totalQuestions: tq,
        correct: c,
        incorrect: inc,
        skipped: sk,
      });
      if (!check.ok) {
        setError(check.error!);
        return;
      }
    }
    start(async () => {
      const res = await recordAttempt({
        assessmentSourceId: assessmentSourceId ?? null,
        planItemId: planItemId ?? null,
        subject,
        attemptDate: f.attemptDate,
        score: s,
        maxScore: ms,
        totalQuestions: tq,
        correct: c,
        incorrect: inc,
        skipped: sk,
        guessed: num(f.guessed),
        durationMinutes: num(f.durationMinutes),
        passingPercentage,
        notes: f.notes || undefined,
        topicErrors: topics
          .filter((t) => t.topic.trim())
          .map((t) => ({
            topic: t.topic,
            errorType: t.errorType as (typeof errorTypeEnum._def.values)[number],
          })),
      });
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        toast({ variant: "error", title: "บันทึกผลไม่สำเร็จ", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: "บันทึกผลสอบแล้ว",
        description: res.message,
      });
      router.refresh();
      onDone?.();
    });
  }

  const field = (
    key: keyof typeof f,
    label: string,
    type = "number"
  ) => (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={f[key]}
        onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))}
        inputMode={type === "number" ? "numeric" : undefined}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">วันที่</Label>
          <DatePicker
            value={f.attemptDate}
            onChange={(v) => setF((p) => ({ ...p, attemptDate: v }))}
            buddhist
            aria-label="วันที่สอบ"
          />
        </div>
        {field("score", "คะแนนที่ได้")}
        {field("maxScore", "คะแนนเต็ม")}
        {field("totalQuestions", "จำนวนข้อ")}
        {field("correct", "ถูก")}
        {field("incorrect", "ผิด")}
        {field("skipped", "ข้าม")}
        {field("guessed", "เดา")}
        {field("durationMinutes", "เวลา (นาที)")}
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">บันทึกเพิ่มเติม</Label>
        <Textarea
          value={f.notes}
          onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">หัวข้อที่ผิด / ประเภทข้อผิดพลาด</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setTopics((p) => [
                ...p,
                { topic: "", errorType: "calculation_error" },
              ])
            }
          >
            + เพิ่ม
          </Button>
        </div>
        {topics.map((t, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="หัวข้อ"
              value={t.topic}
              onChange={(e) =>
                setTopics((p) =>
                  p.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x))
                )
              }
            />
            <div className="w-56 shrink-0">
              <Combobox
                value={t.errorType}
                onValueChange={(v) =>
                  setTopics((p) =>
                    p.map((x, j) => (j === i ? { ...x, errorType: v ?? x.errorType } : x))
                  )
                }
                options={Object.entries(ERROR_TYPE_LABELS).map(([k, v]) => ({
                  value: k,
                  label: v,
                }))}
                searchable={false}
                aria-label="ประเภทข้อผิดพลาด"
              />
            </div>
          </div>
        ))}
      </div>

      {preview ? (
        <p className="text-sm text-muted-foreground">
          คาดการณ์: {preview.percentage}% ·{" "}
          {preview.passed ? (
            <span className="text-primary">ผ่าน</span>
          ) : (
            <span className="text-destructive">ไม่ผ่าน</span>
          )}{" "}
          (เกณฑ์ {passingPercentage}%)
        </p>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "กำลังบันทึก…" : "บันทึกผล"}
        </Button>
        {onDone ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            ปิด
          </Button>
        ) : null}
      </div>
    </div>
  );
}
