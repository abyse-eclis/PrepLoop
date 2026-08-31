"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { TimePicker24h } from "@/components/ui/time-picker";
import { useToast } from "@/components/ui/toast";
import { validateIntervals } from "@/lib/dates";
import {
  EXAM_CATEGORIES,
  getSubjectsForCategory,
} from "@/lib/constants/exam-categories";
import {
  createCustomStudyItem,
  updateCustomStudyItem,
} from "./actions";
import type { CustomStudyItem } from "@/types/db";

interface Interval {
  start: string;
  end: string;
}

interface CustomStudyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  item?: CustomStudyItem | null;
  onSuccess?: () => void;
}

export function CustomStudyDialog({
  open,
  onOpenChange,
  date,
  item,
  onSuccess,
}: CustomStudyDialogProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [examCategory, setExamCategory] = useState("A-Level");
  const [subject, setSubject] = useState("คณิตศาสตร์ 1");
  const [customSubject, setCustomSubject] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [intervals, setIntervals] = useState<Interval[]>([{ start: "", end: "" }]);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form state when modal opens or item changes
  useEffect(() => {
    if (open) {
      if (item) {
        setExamCategory(item.exam_category);
        setSubject(item.subject);
        setCustomSubject(item.custom_subject ?? "");
        setTitle(item.title);
        setUrl(item.url ?? "");
        setEstimatedMinutes(item.estimated_minutes ? String(item.estimated_minutes) : "");
        setIntervals([{ start: "", end: "" }]);
        setNotes(item.notes ?? "");
      } else {
        setExamCategory("A-Level");
        setSubject("คณิตศาสตร์ 1");
        setCustomSubject("");
        setTitle("");
        setUrl("");
        setEstimatedMinutes("");
        setIntervals([{ start: "", end: "" }]);
        setNotes("");
      }
      setError(null);
    }
  }, [open, item]);

  // When exam category changes, update available subjects
  function handleCategoryChange(newCategory: string) {
    setExamCategory(newCategory);
    const available = getSubjectsForCategory(newCategory);
    setSubject(available[0] ?? "อื่น ๆ");
  }

  function updateInterval(idx: number, key: keyof Interval, value: string) {
    setIntervals((prev) =>
      prev.map((iv, i) => (i === idx ? { ...iv, [key]: value } : iv))
    );
  }

  const filledIntervals = intervals.filter((i) => i.start && i.end);
  const intervalPreview =
    filledIntervals.length > 0 ? validateIntervals(filledIntervals) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("กรุณากรอกชื่อบทเรียน / สิ่งที่จะเรียน");
      return;
    }

    if (subject === "อื่น ๆ" && !customSubject.trim()) {
      setError("กรุณากรอกชื่อวิชา");
      return;
    }

    if (filledIntervals.length > 0 && intervalPreview && !intervalPreview.ok) {
      setError(intervalPreview.errors.join("; "));
      return;
    }

    let estMins: number | null = null;
    if (intervalPreview && intervalPreview.ok) {
      estMins = intervalPreview.totalMinutes;
    } else if (estimatedMinutes.trim()) {
      estMins = parseInt(estimatedMinutes, 10);
    }

    if (estMins !== null && (isNaN(estMins) || estMins <= 0)) {
      setError("เวลาที่คาดว่าจะเรียนต้องเป็นตัวเลขมากกว่า 0");
      return;
    }

    startTransition(async () => {
      if (item) {
        const res = await updateCustomStudyItem({
          id: item.id,
          examCategory,
          subject,
          customSubject: subject === "อื่น ๆ" ? customSubject : null,
          title,
          url: url || null,
          estimatedMinutes: estMins,
          notes: notes || null,
        });

        if (res.ok) {
          toast({ variant: "success", title: "แก้ไขการเรียนเองเรียบร้อยแล้ว" });
          onOpenChange(false);
          onSuccess?.();
        } else {
          setError(res.error ?? "เกิดข้อผิดพลาด");
        }
      } else {
        const res = await createCustomStudyItem({
          studyDate: date,
          examCategory,
          subject,
          customSubject: subject === "อื่น ๆ" ? customSubject : null,
          title,
          url: url || null,
          estimatedMinutes: estMins,
          notes: notes || null,
        });

        if (res.ok) {
          toast({ variant: "success", title: "เพิ่มการเรียนเองแล้ว" });
          onOpenChange(false);
          onSuccess?.();
        } else {
          setError(res.error ?? "เกิดข้อผิดพลาด");
        }
      }
    });
  }

  const availableSubjects = getSubjectsForCategory(examCategory);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "แก้ไขการเรียนเอง" : "+ เพิ่มการเรียนเอง"}
      description="เพิ่มคลิป/เว็บ/เอกสารที่ต้องการเรียนวันนี้ (ไม่ผูกกับคอร์สหรือแผนการเรียน)"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
        {/* Exam Category */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">หมวดสอบ *</Label>
          <select
            value={examCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {EXAM_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">วิชา *</Label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {availableSubjects.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Subject (if 'อื่น ๆ' selected) */}
        {subject === "อื่น ๆ" ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium">ระบุชื่อวิชา *</Label>
            <Input
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="เช่น พื้นฐานวิศวกรรม, ภาษาจีน, ฯลฯ"
              autoFocus
            />
          </div>
        ) : null}

        {/* Lesson / Task Title */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">ชื่อบทเรียน / สิ่งที่จะเรียน *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น Tense สรุปก่อนสอบ, โจทย์เซต A-Level"
          />
        </div>

        {/* URL Link */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">ลิงก์ / URL (ถ้ามี)</Label>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=... หรือเว็บอื่น ๆ"
          />
          <p className="text-[11px] text-muted-foreground">
            ใส่ลิงก์ YouTube, เว็บไซต์ หรือ Google Drive เพื่อกดเปิดเรียนได้ทันที
          </p>
        </div>

        {/* Estimated Time Intervals */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">ช่วงเวลาที่คาดว่าจะเรียน</Label>
            {intervalPreview && intervalPreview.ok ? (
              <span className="text-xs font-semibold text-primary">
                รวมทั้งหมด {intervalPreview.totalMinutes} นาที
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            เวลาแบบ 24 ชั่วโมง (เช่น 13:00–14:30) · คำนวณนาทีให้อัตโนมัติ
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
                    onChange={(v) => updateInterval(idx, "start", v)}
                    aria-label="เวลาเริ่ม"
                  />
                </div>
                <span className="pb-2 text-muted-foreground">–</span>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">สิ้นสุด</Label>
                  <TimePicker24h
                    value={iv.end}
                    onChange={(v) => updateInterval(idx, "end", v)}
                    aria-label="เวลาสิ้นสุด"
                  />
                </div>
                {crosses ? (
                  <span className="pb-2 text-xs text-yellow-500 dark:text-yellow-300">
                    สิ้นสุดวันถัดไป
                  </span>
                ) : null}
                {intervals.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 text-xs text-muted-foreground hover:text-destructive"
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

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() =>
                setIntervals((prev) => [...prev, { start: "", end: "" }])
              }
            >
              + เพิ่มช่วงเวลา
            </Button>

            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>หรือระบุนาที:</span>
              <Input
                type="number"
                min="1"
                max="1440"
                value={
                  intervalPreview && intervalPreview.ok
                    ? String(intervalPreview.totalMinutes)
                    : estimatedMinutes
                }
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="เช่น 45"
                className="h-8 w-20 text-xs"
                disabled={Boolean(intervalPreview && intervalPreview.ok)}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">หมายเหตุ (ไม่บังคับ)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="เช่น เน้นจำสูตร, ทำแบบฝึกหัดข้อ 1-10"
            rows={2}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            ยกเลิก
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "กำลังบันทึก…" : item ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
