"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { activityLabel } from "@/lib/status";
import { formatDateKeyThai } from "@/lib/dates";
import { deleteSession, updateStudySession } from "./actions";
import type { PlanItem, StudySession } from "@/types/db";
import type { StudySessionWithPlan } from "./data";

export function SessionHistoryPanel({
  sessions,
  item,
}: {
  sessions: StudySession[];
  item?: PlanItem;
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        ยังไม่มีประวัติการเรียนสำหรับรายการนี้
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => (
        <SessionEditor key={session.id} session={session} item={item} compact />
      ))}
    </div>
  );
}

export function SessionHistoryList({
  sessions,
}: {
  sessions: StudySessionWithPlan[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        ยังไม่มี Study Session ในวันที่เลือก
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map(({ session, item }) => (
        <SessionEditor key={session.id} session={session} item={item ?? undefined} />
      ))}
    </div>
  );
}

function SessionEditor({
  session,
  item,
  compact,
}: {
  session: StudySession;
  item?: PlanItem;
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sessionDate, setSessionDate] = useState(session.session_date);
  const [startTime, setStartTime] = useState(session.start_time ?? "");
  const [endTime, setEndTime] = useState(session.end_time ?? "");
  const [note, setNote] = useState(session.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateStudySession({
        sessionId: session.id,
        sessionDate,
        startTime,
        endTime,
        note: note || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "แก้ไขไม่สำเร็จ");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    const label = `${session.start_time ?? "--:--"}–${
      session.end_time ?? "--:--"
    } · ${session.duration_minutes} นาที`;
    const ok = window.confirm(
      `ลบประวัติการเรียนนี้?\n\n${label}\n\nการลบจะลบเฉพาะประวัติการเรียนจริง\nและไม่ลบรายการในแผน`
    );
    if (!ok) return;

    setError(null);
    start(async () => {
      const res = await deleteSession({ sessionId: session.id });
      if (!res.ok) {
        setError(res.error ?? "ลบไม่สำเร็จ");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {item ? (
            <p className="truncate text-sm font-medium">{planItemTitle(item)}</p>
          ) : (
            <p className="text-sm font-medium">{session.subject ?? "ทั่วไป"}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {formatDateKeyThai(session.session_date, { buddhist: true })} ·{" "}
            {session.start_time ?? "--:--"}–{session.end_time ?? "--:--"} ·{" "}
            {session.duration_minutes} นาที
          </p>
          {!compact && item ? (
            <p className="mt-1 text-xs text-muted-foreground">
              planned date: {formatDateKeyThai(item.date, { buddhist: true })}
            </p>
          ) : null}
          {session.note ? (
            <p className="mt-1 text-xs text-muted-foreground">{session.note}</p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setEditing((v) => !v)}
          >
            แก้ไข
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={remove}
          >
            ลบ
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">วันที่เรียนจริง</Label>
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">เริ่ม</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">สิ้นสุด</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-xs">บันทึก</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ยังไม่เข้าใจช่วงท้ายคลิป"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive sm:col-span-2">{error}</p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={pending} onClick={save}>
              {pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function planItemTitle(item: PlanItem): string {
  const lesson =
    item.lesson_from && item.lesson_to && item.lesson_to !== item.lesson_from
      ? ` · คลิป ${item.lesson_from}–${item.lesson_to}`
      : item.lesson_from
        ? ` · คลิป ${item.lesson_from}`
        : "";
  return `${item.subject}${item.course_code ? ` · ${item.course_code}` : ""}${lesson} · ${activityLabel(
    item.activity_type
  )}`;
}

