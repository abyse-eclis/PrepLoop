"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateReview } from "./actions";
import type { ReviewTask } from "@/types/db";

export function ReviewItem({ review }: { review: ReviewTask }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState(review.result ?? "");
  const [open, setOpen] = useState(false);

  function save(status: "done" | "skipped") {
    start(async () => {
      const res = await updateReview({
        reviewId: review.id,
        status,
        result: result || undefined,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {review.subject ?? "ทบทวน"}
            {review.course_code ? ` · ${review.course_code}` : ""}
            {review.lesson_from
              ? ` · คลิป ${review.lesson_from}${
                  review.lesson_to && review.lesson_to !== review.lesson_from
                    ? `–${review.lesson_to}`
                    : ""
                }`
              : ""}
          </p>
          {review.reason ? (
            <p className="text-xs text-muted-foreground">{review.reason}</p>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          กำหนด {review.due_date}
        </span>
      </div>

      {review.instructions && review.instructions.length > 0 ? (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
          {review.instructions.map((ins, i) => (
            <li key={i}>{ins}</li>
          ))}
        </ol>
      ) : null}

      {review.status !== "pending" ? (
        <p className="mt-2 text-xs">
          สถานะ:{" "}
          <span
            className={
              review.status === "done" ? "text-primary" : "text-muted-foreground"
            }
          >
            {review.status === "done" ? "ทบทวนแล้ว" : "ข้าม"}
          </span>
          {review.result ? ` · ${review.result}` : ""}
        </p>
      ) : (
        <div className="mt-3">
          {open ? (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="ผลการทบทวน เช่น ทำได้เอง / เปิดสูตร / ยังไม่ได้"
                value={result}
                onChange={(e) => setResult(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => save("done")}>
                  ทบทวนแล้ว
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => save("skipped")}
                >
                  ข้าม
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              บันทึกผลทบทวน
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
