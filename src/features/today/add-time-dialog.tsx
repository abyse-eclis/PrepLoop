"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { TimePicker24h } from "@/components/ui/time-picker";
import { Alert } from "@/components/ui/alert";
import { validateIntervals, type TimeInterval } from "@/lib/dates";

interface Interval {
  start: string;
  end: string;
}

export interface AddTimeSubmission {
  intervals: TimeInterval[];
  totalMinutes: number;
  note: string | undefined;
}

/**
 * "เพิ่มเวลา" dialog shared by every Study Session card. Validation and the
 * total-minutes preview run client-side; the caller persists.
 */
export function AddTimeDialog({
  open,
  onOpenChange,
  title,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (submission: AddTimeSubmission) => void;
}) {
  const [intervals, setIntervals] = useState<Interval[]>([{ start: "", end: "" }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIntervals([{ start: "", end: "" }]);
      setNote("");
      setError(null);
    }
  }, [open]);

  const filled = intervals.filter((i) => i.start && i.end);
  const preview = filled.length > 0 ? validateIntervals(filled) : null;

  function update(idx: number, key: keyof Interval, value: string) {
    setIntervals((prev) => prev.map((iv, i) => (i === idx ? { ...iv, [key]: value } : iv)));
  }

  function submit() {
    setError(null);
    if (filled.length === 0) {
      setError("กรุณากรอกอย่างน้อยหนึ่งช่วงเวลา");
      return;
    }
    if (!preview || !preview.ok) {
      setError(preview?.errors.join("; ") ?? "ช่วงเวลาไม่ถูกต้อง");
      return;
    }
    onSubmit({ intervals: filled, totalMinutes: preview.totalMinutes, note: note || undefined });
    onOpenChange(false);
  }

  const messages = preview && !preview.ok ? preview.errors : error ? [error] : [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="เพิ่มเวลาเรียน"
      description={title}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button size="sm" onClick={submit}>
            บันทึกเวลา{preview?.ok ? ` (${preview.totalMinutes} นาที)` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          เวลาแบบ 24 ชั่วโมง (เช่น 23:38) · รองรับช่วงข้ามคืน เช่น 23:38–00:50
        </p>
        {intervals.map((iv, idx) => {
          const one = iv.start && iv.end ? validateIntervals([iv]) : null;
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
                  onClick={() => setIntervals((prev) => prev.filter((_, i) => i !== idx))}
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
            onClick={() => setIntervals((prev) => [...prev, { start: "", end: "" }])}
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

        {messages.length > 0 ? (
          <Alert variant="destructive">
            <ul className="space-y-0.5">
              {messages.map((m, i) => (
                <li key={i}>• {m}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
