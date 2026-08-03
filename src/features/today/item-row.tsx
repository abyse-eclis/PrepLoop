"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ResolvedPlanItem } from "@/features/plans/data";
import { activityLabel } from "@/lib/status";
import { StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setItemStatus } from "@/features/sessions/actions";
import { AddTimeForm } from "@/features/sessions/add-time-form";
import type { PlanItemStatus } from "@/lib/schemas/common";
import { PRIORITY_WEIGHT } from "@/lib/calculations";

const PRIORITY_LABEL: Record<string, string> = {
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
};

const ASSESSMENT_TYPES = new Set(["diagnostic", "quiz", "exercise", "mock"]);

export function ItemRow({ row, date }: { row: ResolvedPlanItem; date: string }) {
  const { item } = row;
  const [openTime, setOpenTime] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(status: PlanItemStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setItemStatus({ planItemId: item.id, status });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  const isAssessment = ASSESSMENT_TYPES.has(item.activity_type);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.subject}</span>
              {item.course_code ? (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                  {item.course_code}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {activityLabel(item.activity_type)}
              </span>
              <span className="text-xs text-muted-foreground">
                · ความสำคัญ {PRIORITY_LABEL[item.priority]} (
                {PRIORITY_WEIGHT[item.priority]})
              </span>
            </div>
            {item.lesson_from ? (
              <p className="mt-1 text-xs text-muted-foreground">
                คลิป {item.lesson_from}
                {item.lesson_to && item.lesson_to !== item.lesson_from
                  ? `–${item.lesson_to}`
                  : ""}
              </p>
            ) : null}
            {item.instructions ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {item.instructions}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <StatusBadge status={row.status} />
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {row.actualMinutes}/{item.target_minutes} นาที
            </div>
          </div>
        </div>

        {row.sessions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.sessions.map((s) => (
              <span
                key={s.id}
                className="rounded bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
              >
                {s.start_time}–{s.end_time} ({s.duration_minutes}น.)
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => changeStatus("studying")}
          >
            เริ่มเรียน
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => changeStatus("paused")}
          >
            พัก
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => changeStatus("studying")}
          >
            เรียนต่อ
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => changeStatus("completed")}
          >
            เรียนเสร็จ
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenTime((v) => !v)}
          >
            เพิ่มเวลา
          </Button>
          {isAssessment ? (
            <Link href={`/assessments?item=${item.id}`}>
              <Button size="sm" variant="outline">
                กรอกผล
              </Button>
            </Link>
          ) : null}
          <Link href={`/plan?item=${item.stable_external_id}`}>
            <Button size="sm" variant="ghost">
              ดูรายละเอียด
            </Button>
          </Link>
        </div>

        {openTime ? (
          <div className="mt-4 border-t border-border pt-4">
            <AddTimeForm
              planItemId={item.id}
              sessionDate={date}
              onDone={() => setOpenTime(false)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
