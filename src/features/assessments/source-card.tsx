"use client";

import { subjectLabel } from "@/lib/subjects";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
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
  const [open, setOpen] = useState(false);

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
              วิชา {subjectLabel(source.subject)}
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

        <div className="mt-3">
          <Button size="sm" onClick={() => setOpen(true)}>
            กรอกผล
          </Button>
        </div>

        <Dialog
          open={open}
          onOpenChange={setOpen}
          title={`กรอกผล — ${source.title}`}
          description={`วิชา ${subjectLabel(source.subject)} · เกณฑ์ผ่าน ${source.passing_percentage}%`}
        >
          <ResultForm
            subject={source.subject}
            assessmentSourceId={source.id}
            passingPercentage={source.passing_percentage}
            defaultDate={today}
            onDone={() => setOpen(false)}
          />
        </Dialog>
      </CardContent>
    </Card>
  );
}
