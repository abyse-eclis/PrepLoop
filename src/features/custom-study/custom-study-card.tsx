"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { Input, Label } from "@/components/ui/input";
import { TimePicker24h } from "@/components/ui/time-picker";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { formatCustomStudyLabel } from "@/lib/constants/exam-categories";
import { validateIntervals } from "@/lib/dates";
import {
  setCustomStudyStatus,
  deleteCustomStudyItem,
  addCustomStudyTime,
} from "./actions";
import { CustomStudyDialog } from "./custom-study-dialog";
import type { CustomStudyItem, StudySession } from "@/types/db";

interface Interval {
  start: string;
  end: string;
}

export interface CustomStudyWithSessions {
  item: CustomStudyItem;
  sessions: StudySession[];
  actualMinutes: number;
}

export function CustomStudyCard({
  data,
  date,
}: {
  data: CustomStudyWithSessions;
  date: string;
}) {
  const { item, sessions, actualMinutes } = data;
  const { toast } = useToast();
  const [openTime, setOpenTime] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openMore, setOpenMore] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Time logging state
  const [intervals, setIntervals] = useState<Interval[]>([{ start: "", end: "" }]);
  const [timeNote, setTimeNote] = useState("");

  const isStudying = item.status === "studying";
  const isCompleted = item.status === "completed";

  function handleStatusChange(
    newStatus: "not_started" | "studying" | "paused" | "completed"
  ) {
    setError(null);
    startTransition(async () => {
      const res = await setCustomStudyStatus({ id: item.id, status: newStatus });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  function handleDelete() {
    if (!window.confirm(`ต้องการลบ "${item.title}" หรือไม่?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCustomStudyItem({ id: item.id });
      if (res.ok) {
        toast({ variant: "success", title: "ลบรายการแล้ว" });
      } else {
        setError(res.error ?? "เกิดข้อผิดพลาดในการลบ");
      }
    });
  }

  function updateInterval(idx: number, key: keyof Interval, value: string) {
    setIntervals((prev) =>
      prev.map((iv, i) => (i === idx ? { ...iv, [key]: value } : iv))
    );
  }

  function handleSaveTime() {
    setError(null);
    const valid = intervals.filter((i) => i.start && i.end);
    if (valid.length === 0) {
      setError("กรุณากรอกอย่างน้อยหนึ่งช่วงเวลา");
      return;
    }

    startTransition(async () => {
      const res = await addCustomStudyTime({
        customStudyItemId: item.id,
        sessionDate: date,
        intervals: valid,
        note: timeNote || undefined,
      });

      if (res.ok) {
        setIntervals([{ start: "", end: "" }]);
        setTimeNote("");
        setOpenTime(false);
        toast({ variant: "success", title: "บันทึกเวลาแล้ว", description: res.message });
      } else {
        setError(res.error ?? "บันทึกเวลาไม่สำเร็จ");
      }
    });
  }

  const filled = intervals.filter((i) => i.start && i.end);
  const preview = filled.length > 0 ? validateIntervals(filled) : null;

  return (
    <>
      <Card className={isStudying ? "border-primary/60 shadow-sm ring-1 ring-primary/20" : ""}>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 text-xs">
                  เรียนเสริม
                </span>
                <span className="font-medium text-sm">
                  {formatCustomStudyLabel(
                    item.exam_category,
                    item.subject,
                    item.custom_subject
                  )}
                </span>
              </div>

              <h3 className="mt-1 font-semibold text-base break-words">
                {item.title}
              </h3>

              {item.notes ? (
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {item.notes}
                </p>
              ) : null}

              {item.url ? (
                <div className="mt-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    เปิดลิงก์
                  </a>
                </div>
              ) : null}
            </div>

            <div className="text-right">
              <div className="flex flex-wrap justify-end gap-1.5">
                {isCompleted ? (
                  <Badge className="status-completed">เรียนเสร็จแล้ว</Badge>
                ) : isStudying ? (
                  <Badge className="status-studying">กำลังเรียน</Badge>
                ) : item.status === "paused" ? (
                  <Badge className="status-paused">พัก</Badge>
                ) : (
                  <Badge className="status-not_started">ยังไม่เริ่ม</Badge>
                )}
              </div>

              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {actualMinutes > 0 ? (
                  <span>
                    เรียนไป {actualMinutes}
                    {item.estimated_minutes ? `/${item.estimated_minutes}` : ""}{" "}
                    นาที
                  </span>
                ) : item.estimated_minutes ? (
                  <span>ประมาณ {item.estimated_minutes} นาที</span>
                ) : (
                  <span>ไม่ได้ระบุเวลา</span>
                )}
              </div>
            </div>
          </div>

          {/* Session badges */}
          {sessions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sessions.map((s) => (
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

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {!isCompleted ? (
              <Button
                size="sm"
                variant={isStudying ? "secondary" : "default"}
                disabled={pending}
                onClick={() =>
                  handleStatusChange(isStudying ? "paused" : "studying")
                }
              >
                {isStudying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 mr-1" />
                    พัก
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {item.status === "not_started" ? "เริ่มเรียน" : "เรียนต่อ"}
                  </>
                )}
              </Button>
            ) : null}

            <Button
              size="sm"
              variant={isCompleted ? "secondary" : "outline"}
              disabled={pending}
              onClick={() =>
                handleStatusChange(isCompleted ? "not_started" : "completed")
              }
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {isCompleted ? "เรียนอีกครั้ง" : "เรียนเสร็จ"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenTime((v) => !v)}
              title="เพิ่มเวลาเรียนจริง"
            >
              <Clock className="h-3.5 w-3.5 mr-1" />
              เพิ่มเวลา
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpenMore((v) => !v)}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>

          {openMore ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenEdit(true);
                  setOpenMore(false);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                แก้ไข
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                ลบ
              </Button>
            </div>
          ) : null}

          {/* Add Time Form */}
          {openTime ? (
            <div className="mt-4 border-t border-border pt-4 flex flex-col gap-3">
              <p className="text-sm font-medium">เพิ่มเวลาเรียน (กรอกเอง)</p>
              {intervals.map((iv, idx) => (
                <div key={idx} className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">เริ่ม</Label>
                    <TimePicker24h
                      value={iv.start}
                      onChange={(v) => updateInterval(idx, "start", v)}
                    />
                  </div>
                  <span className="pb-2">–</span>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">สิ้นสุด</Label>
                    <TimePicker24h
                      value={iv.end}
                      onChange={(v) => updateInterval(idx, "end", v)}
                    />
                  </div>
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
              ))}

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
                  value={timeNote}
                  onChange={(e) => setTimeNote(e.target.value)}
                  placeholder="เช่น ทำสรุปย่อ, เข้าใจสูตรแล้ว"
                />
              </div>

              {preview && preview.ok ? (
                <p className="text-sm text-primary">
                  รวมทั้งหมด {preview.totalMinutes} นาที
                </p>
              ) : null}

              {preview && !preview.ok ? (
                <Alert variant="destructive">
                  <ul className="space-y-0.5">
                    {preview.errors.map((m, i) => (
                      <li key={i}>• {m}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveTime} disabled={pending}>
                  {pending ? "กำลังบันทึก…" : "บันทึกเวลา"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenTime(false)}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <CustomStudyDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        date={date}
        item={item}
      />
    </>
  );
}
