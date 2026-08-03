"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { buildAssessmentPrompt } from "@/lib/prompts/generator";
import type { AssessmentType } from "@/lib/schemas/common";

export interface CompletedLessonOption {
  subject: string;
  courseCode: string | null;
  lessonNumber: string;
  title: string;
}

export function PromptGeneratorClient({
  lessons,
  subjects,
}: {
  lessons: CompletedLessonOption[];
  subjects: string[];
}) {
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("quiz");
  const [questionCount, setQuestionCount] = useState("10");
  const [passing, setPassing] = useState("70");
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  const completed = lessons.filter(
    (l) => !subject || l.subject === subject
  );

  function generate() {
    setCopied(false);
    const text = buildAssessmentPrompt({
      subject: subject || "ไม่ระบุ",
      courseCode: completed[0]?.courseCode ?? null,
      assessmentType,
      completedLessons: completed.map((l) => ({
        lessonNumber: l.lessonNumber,
        title: l.title,
      })),
      coveredTopics: [],
      questionCount: Number(questionCount) || 10,
      passingPercentage: Number(passing) || 70,
    });
    setPrompt(text);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>สร้าง Prompt สำหรับออกข้อสอบ (เมื่อไม่มีชุดข้อสอบที่ตรง)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Prompt จะล็อกเฉพาะบทเรียนที่ “เรียนจบแล้ว” เท่านั้น
          (มี {completed.length} บทในขอบเขตนี้) — คัดลอกไปใช้กับ ChatGPT/Claude
          เอง ไม่มีการเรียก API
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">วิชา</Label>
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">ประเภท</Label>
            <Select
              value={assessmentType}
              onChange={(e) =>
                setAssessmentType(e.target.value as AssessmentType)
              }
            >
              <option value="diagnostic">Diagnostic</option>
              <option value="quiz">Quiz</option>
              <option value="exercise">Exercise</option>
              <option value="mock">Mock</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">จำนวนข้อ</Label>
            <Input
              type="number"
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">เกณฑ์ผ่าน %</Label>
            <Input
              type="number"
              value={passing}
              onChange={(e) => setPassing(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={generate}>
            สร้าง Prompt
          </Button>
          {prompt ? (
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
            </Button>
          ) : null}
        </div>

        {prompt ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs">
            {prompt}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
