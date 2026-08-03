"use client";

import { useMemo, useState } from "react";
import type { PlanItem } from "@/types/db";
import { activityLabel } from "@/lib/status";
import { Select } from "@/components/ui/input";
import { formatDateKeyThai } from "@/lib/dates";

type Grouping = "day" | "week" | "month";

export function PlanSchedule({ items }: { items: PlanItem[] }) {
  const [subject, setSubject] = useState("");
  const [activity, setActivity] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("day");

  const subjects = useMemo(
    () => Array.from(new Set(items.map((i) => i.subject))).sort(),
    [items]
  );
  const activities = useMemo(
    () => Array.from(new Set(items.map((i) => i.activity_type))).sort(),
    [items]
  );

  const filtered = items.filter(
    (i) =>
      (!subject || i.subject === subject) &&
      (!activity || i.activity_type === activity)
  );

  const groups = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of filtered) {
      let key = item.date;
      if (grouping === "week") key = weekLabel(item.date);
      else if (grouping === "month") key = item.date.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, grouping]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select
          value={grouping}
          onChange={(e) => setGrouping(e.target.value as Grouping)}
          className="w-auto"
        >
          <option value="day">รายวัน</option>
          <option value="week">รายสัปดาห์</option>
          <option value="month">รายเดือน</option>
        </Select>
        <Select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-auto"
        >
          <option value="">ทุกวิชา</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          className="w-auto"
        >
          <option value="">ทุกกิจกรรม</option>
          {activities.map((a) => (
            <option key={a} value={a}>
              {activityLabel(a)}
            </option>
          ))}
        </Select>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีรายการตามตัวกรอง</p>
      ) : (
        groups.map(([key, groupItems]) => {
          const totalMin = groupItems.reduce((s, i) => s + i.target_minutes, 0);
          return (
            <div key={key} className="rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-medium">
                  {grouping === "day" ? formatDateKeyThai(key) : key}
                </span>
                <span className="text-xs text-muted-foreground">
                  {groupItems.length} รายการ · {totalMin} นาที
                </span>
              </div>
              <div className="scroll-x">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-1.5 font-medium">วิชา</th>
                      <th className="px-3 py-1.5 font-medium">คอร์ส/คลิป</th>
                      <th className="px-3 py-1.5 font-medium">กิจกรรม</th>
                      <th className="px-3 py-1.5 font-medium">เป้าหมาย</th>
                      <th className="px-3 py-1.5 font-medium">ความสำคัญ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupItems.map((i) => (
                      <tr key={i.id} className="border-t border-border/60">
                        <td className="px-3 py-1.5">{i.subject}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {i.course_code ?? "-"}
                          {i.lesson_from ? ` · ${i.lesson_from}` : ""}
                          {i.lesson_to && i.lesson_to !== i.lesson_from
                            ? `–${i.lesson_to}`
                            : ""}
                        </td>
                        <td className="px-3 py-1.5">
                          {activityLabel(i.activity_type)}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">
                          {i.target_minutes}น.
                        </td>
                        <td className="px-3 py-1.5">{i.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function weekLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
