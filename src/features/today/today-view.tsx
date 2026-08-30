import Link from "next/link";
import type { Workspace } from "@/types/db";
import type { StudyQueueData } from "@/features/plans/data";
import { timeCompletion, taskCompletion } from "@/lib/calculations";
import { formatDateKeyThai } from "@/lib/dates";
import { subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/status";
import { Stat, EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemRow } from "./item-row";

export function TodayView({ workspace, date, queue }: {
  workspace: Workspace; date: string; queue: StudyQueueData;
}) {
  const daily = timeCompletion(queue.actualMinutesToday, workspace.daily_target_minutes);
  const remainingToday = Math.max(0, workspace.daily_target_minutes - queue.actualMinutesToday);
  const planPercent = taskCompletion(queue.completedItems, queue.totalItems);
  const currentNumber = queue.current?.item.order_index ?? null;
  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div><h1 className="text-xl font-bold">วันนี้</h1><p className="text-sm text-muted-foreground">{formatDateKeyThai(date, { buddhist: true })} · {workspace.timezone}</p></div>
      <span className="text-sm text-muted-foreground">{queue.version ? `แผน: ${queue.version.name}` : "ยังไม่มีแผนที่ active"}</span>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="เป้าหมายวันนี้" value={`${workspace.daily_target_minutes} นาที`} />
      <Stat label="เรียนแล้ว" value={`${queue.actualMinutesToday} นาที`} />
      <Stat label="เหลือ" value={`${remainingToday} นาที`} hint={remainingToday === 0 ? "ครบเป้าหมายวันนี้แล้ว" : undefined} />
      <Stat label="Nap เป้าหมาย" value={`${workspace.nap_target_min}–${workspace.nap_target_max} นาที`} />
    </section>
    <Card><CardHeader><CardTitle>{remainingToday === 0 ? "ครบเป้าหมายวันนี้แล้ว — ยังเรียนต่อได้" : "ความคืบหน้าวันนี้"}</CardTitle></CardHeader><CardContent>
      <Progress value={daily.percent} /><p className="mt-2 text-xs text-muted-foreground">{queue.actualMinutesToday} / {workspace.daily_target_minutes} นาที</p>
    </CardContent></Card>

    <section><h2 className="mb-3 text-sm font-semibold text-muted-foreground">กำลังเรียน</h2>
      {queue.current ? <ItemRow row={queue.current} date={date} queuePosition={currentNumber ?? undefined} /> : <EmptyState
        title={queue.totalItems > 0 ? "เรียนครบทุกรายการแล้ว" : "ยังไม่มีรายการในคิว"}
        description="นำเข้าและเปิดใช้แผนเพื่อเริ่มเรียนตามลำดับ"
        action={<Link href="/imports"><Button variant="outline">นำเข้าแผน</Button></Link>} />}
    </section>

    {queue.upcoming.length > 0 ? <Card><CardHeader><CardTitle>ถัดไป</CardTitle></CardHeader><CardContent><ol className="space-y-2">
      {queue.upcoming.map((row) => <li key={row.item.id} className="flex gap-3 border-b border-border/60 pb-2 text-sm last:border-0">
        <span className="tabular-nums text-muted-foreground">#{row.item.order_index}</span><span><b>{subjectLabel(row.item.subject)}</b>{row.item.course_code ? ` · ${row.item.course_code}` : ""}{row.item.lesson_from ? ` (${row.item.lesson_from}${row.item.lesson_to !== row.item.lesson_from && row.item.lesson_to ? `–${row.item.lesson_to}` : ""})` : ""} · {activityLabel(row.item.activity_type)}</span>
      </li>)}
    </ol></CardContent></Card> : null}

    <Card><CardHeader><CardTitle>ความคืบหน้าแผน</CardTitle></CardHeader><CardContent><Progress value={planPercent} /><p className="mt-2 text-xs text-muted-foreground">{queue.completedItems} / {queue.totalItems} รายการเสร็จแล้ว{currentNumber ? ` · Current queue #${currentNumber}` : ""}</p></CardContent></Card>

    <Card><CardHeader><CardTitle>Sessions วันนี้</CardTitle></CardHeader><CardContent>
      {queue.todaySessions.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มี session วันนี้</p> : <div className="space-y-2">{queue.todaySessions.map((s) => <div key={s.id} className="flex justify-between gap-3 border-b border-border/60 pb-2 text-sm last:border-0"><span>{s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : "ไม่ระบุเวลา"} · {s.course_code ?? subjectLabel(s.subject)}{s.actual_lesson_from ? ` (${s.actual_lesson_from})` : ""}</span><span className="tabular-nums text-muted-foreground">{s.duration_minutes} นาที</span></div>)}</div>}
    </CardContent></Card>
  </div>;
}
