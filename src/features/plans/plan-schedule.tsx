"use client";

import { useMemo, useState } from "react";
import type { ItemStatusOverride, PlanItem, StudySession } from "@/types/db";
import { subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/status";
import { Combobox } from "@/components/ui/combobox";

const terminal = new Set(["completed", "cancelled"]);

export function PlanSchedule({ items, overrides = [], sessions = [] }: {
  items: PlanItem[]; overrides?: ItemStatusOverride[]; sessions?: StudySession[];
}) {
  const [subject, setSubject] = useState("");
  const subjects = useMemo(() => Array.from(new Set(items.map((i) => i.subject))).sort(), [items]);
  const statusById = useMemo(() => new Map(overrides.map((o) => [o.plan_item_id, o.status])), [overrides]);
  const minutesById = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) if (session.plan_item_id) map.set(session.plan_item_id, (map.get(session.plan_item_id) ?? 0) + Math.max(0, session.duration_minutes));
    return map;
  }, [sessions]);
  const ordered = [...items].sort((a, b) => a.order_index - b.order_index);
  const currentId = ordered.find((i) => !terminal.has(statusById.get(i.id) ?? "not_started") && !i.scheduled_at)?.id;
  const filtered = ordered.filter((i) => !subject || i.subject === subject);
  return <div className="flex flex-col gap-4">
    <div className="w-48"><Combobox value={subject || null} onValueChange={(v) => setSubject(v ?? "")} options={[{ value: "", label: "ทุกวิชา" }, ...subjects.map((s) => ({ value: s, label: subjectLabel(s) }))]} placeholder="ทุกวิชา" searchable={subjects.length > 8} aria-label="กรองตามวิชา" /></div>
    <div className="divide-y divide-border rounded-lg border border-border">
      {filtered.map((item) => {
        const status = statusById.get(item.id) ?? "not_started";
        const actual = minutesById.get(item.id) ?? 0;
        const isCurrent = item.id === currentId;
        const marker = status === "completed" ? "✓" : isCurrent ? "→" : status === "cancelled" ? "—" : "○";
        return <div key={item.id} className={`flex flex-wrap items-center gap-3 px-3 py-3 text-sm ${isCurrent ? "bg-accent/60" : ""}`}>
          <span className="w-5 text-center font-semibold" aria-hidden>{marker}</span><span className="w-12 tabular-nums text-muted-foreground">#{item.order_index}</span>
          <div className="min-w-0 flex-1"><div className="font-medium">{subjectLabel(item.subject)}{item.course_code ? ` · ${item.course_code}` : ""}{item.lesson_from ? ` (${item.lesson_from}${item.lesson_to && item.lesson_to !== item.lesson_from ? `–${item.lesson_to}` : ""})` : ""}</div><div className="text-xs text-muted-foreground">{activityLabel(item.activity_type)}{isCurrent ? " · กำลังเรียน" : status === "completed" ? " · เสร็จแล้ว" : " · Upcoming"}{item.scheduled_at ? ` · กำหนด ${new Date(item.scheduled_at).toLocaleString("th-TH")}` : ""}</div></div>
          <span className="tabular-nums text-muted-foreground">{actual} / {item.target_minutes} นาที</span>
        </div>;
      })}
      {filtered.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ไม่มีรายการตามตัวกรอง</p> : null}
    </div>
  </div>;
}
