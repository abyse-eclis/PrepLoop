"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { TimePicker24h } from "@/components/ui/time-picker";
import { addTimeIntervals } from "./actions";
import { validateIntervals } from "@/lib/dates";
import { useRouter } from "next/navigation";

interface Interval {
  start: string;
  end: string;
}

export function AddTimeForm({
  planItemId,
  sessionDate,
  onDone,
}: {
  planItemId: string;
  sessionDate: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [intervals, setIntervals] = useState<Interval[]>([
    { start: "", end: "" },
  ]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filled = intervals.filter((i) => i.start && i.end);
  const preview = filled.length > 0 ? validateIntervals(filled) : null;

  function update(idx: number, key: keyof Interval, value: string) {
    setIntervals((prev) =>
      prev.map((iv, i) => (i === idx ? { ...iv, [key]: value } : iv))
    );
  }

  function submit() {
    setError(null);
    const valid = intervals.filter((i) => i.start && i.end);
    if (valid.length === 0) {
      setError("กรุณากรอกอย่างน้อยหนึ่งช่วงเวลา");
      return;
    }
    startTransition(async () => {
      const res = await addTimeIntervals({
        planItemId,
        sessionDate,
        intervals: valid,
        note: note || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setIntervals([{ start: "", end: "" }]);
      setNote("");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">เพิ่มเวลาเรียน (กรอกเอง)</p>
      <p className="text-xs text-muted-foreground">
        เวลาแบบ 24 ชั่วโมง (เช่น 23:38) · รองรับช่วงข้ามคืน เช่น 23:38–00:50
      </p>
      {intervals.map((iv, idx) => {
        const one =
          iv.start && iv.end ? validateIntervals([iv]) : null;
        const crosses = one?.details[0]?.crossesMidnight ?? false;
        return (
          <div key={idx} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">เริ่ม</Label>
              <TimePicker24h
                value={iv.start}
                onChange={(v) => update(idx, "start", v)}
                aria-label="เวลาเริ่ม"
              />
            </div>
            <span className="pb-2">–</span>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">สิ้นสุด</Label>
              <TimePicker24h
                value={iv.end}
                onChange={(v) => update(idx, "end", v)}
                aria-label="เวลาสิ้นสุด"
              />
            </div>
            {crosses ? (
              <span className="pb-2 text-xs text-yellow-300">สิ้นสุดวันถัดไป</span>
            ) : null}
            {intervals.length > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setIntervals((prev) => prev.filter((_, i) => i !== idx))
                }
              >
                ลบ
              </Button>
            ) : null}
          </div>
        );
      })}

      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setIntervals((prev) => [...prev, { start: "", end: "" }])
          }
        >
          + เพิ่มช่วงเวลา
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">บันทึก (ไม่บังคับ)</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น ทำโจทย์ท้ายคลิป"
        />
      </div>

      {preview && preview.ok ? (
        <p className="text-sm text-primary">
          รวมทั้งหมด {preview.totalMinutes} นาที
        </p>
      ) : null}
      {/* One error per problem, from a single source (client preview first,
          else the server error) — never both, so nothing is shown twice. */}
      {(() => {
        const messages =
          preview && !preview.ok ? preview.errors : error ? [error] : [];
        if (messages.length === 0) return null;
        return (
          <ul className="space-y-0.5 text-sm text-destructive">
            {messages.map((m, i) => (
              <li key={i}>• {m}</li>
            ))}
          </ul>
        );
      })()}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "กำลังบันทึก…" : "บันทึกเวลา"}
        </Button>
        {onDone ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            ยกเลิก
          </Button>
        ) : null}
      </div>
    </div>
  );
}
