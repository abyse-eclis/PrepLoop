"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSignedUrl } from "@/features/imports/upload-actions";
import { ResultForm } from "./result-form";
import { activityLabel } from "@/lib/status";
import type { AssessmentSource } from "@/types/db";

export function SourceCard({
  source,
  today,
}: {
  source: AssessmentSource;
  today: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function open(kind: "question" | "answer" | "solution") {
    if (!source.source_file_id) {
      setMsg("ไม่มีไฟล์แนบสำหรับชุดนี้");
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await getSignedUrl(source.source_file_id!);
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        setMsg(res.error ?? "เปิดไฟล์ไม่สำเร็จ");
      }
    });
  }

  const pages = (from: number | null, to: number | null) =>
    from ? `หน้า ${from}${to && to !== from ? `–${to}` : ""}` : "—";

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{source.title}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                {activityLabel(source.type)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              วิชา {source.subject}
              {source.course_code ? ` · คอร์ส ${source.course_code}` : ""}
              {source.lesson_from
                ? ` · คลิป ${source.lesson_from}${
                    source.lesson_to && source.lesson_to !== source.lesson_from
                      ? `–${source.lesson_to}`
                      : ""
                  }`
                : ""}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            เกณฑ์ผ่าน {source.passing_percentage}%
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>โจทย์: {pages(source.question_page_from, source.question_page_to)}</div>
          <div>เฉลย: {pages(source.answer_page_from, source.answer_page_to)}</div>
          <div>
            เฉลยละเอียด:{" "}
            {pages(source.solution_page_from, source.solution_page_to)}
          </div>
        </div>

        {source.covered_topics && source.covered_topics.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            หัวข้อ: {source.covered_topics.join(", ")}
          </p>
        ) : null}

        {msg ? <p className="mt-2 text-xs text-destructive">{msg}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => open("question")}
          >
            เปิดข้อสอบ
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => open("answer")}
          >
            เปิดเฉลย
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => open("solution")}
          >
            เฉลยละเอียด
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            กรอกผล
          </Button>
        </div>

        {showForm ? (
          <div className="mt-4 border-t border-border pt-4">
            <ResultForm
              subject={source.subject}
              assessmentSourceId={source.id}
              passingPercentage={source.passing_percentage}
              defaultDate={today}
              onDone={() => setShowForm(false)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
