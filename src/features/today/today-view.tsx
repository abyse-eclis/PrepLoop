"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import type { CustomStudyItem, ReviewTask, Workspace } from "@/types/db";
import type { TodayStudyQueue } from "@/features/today/data";
import { formatDateKeyThai } from "@/lib/dates";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ReviewItem } from "@/features/reviews/review-item";
import { CustomStudyDialog } from "@/features/custom-study/custom-study-dialog";
import { deleteCustomStudyItem } from "@/features/custom-study/actions";
import {
  applyCustomItemToSession,
  applySessionPatch,
  buildCustomSessionVM,
  groupStudyQueue,
  optimisticAddTime,
  optimisticStatus,
  removeSession,
  replaceSession,
  summarizeStudyQueue,
  type SessionHistoryEntry,
  type SessionPatch,
  type SessionStatusAction,
  type StudySessionVM,
} from "@/lib/study-session";
import { StudySessionCard, type StudySessionCardHandlers } from "./study-session-card";
import type { AddTimeSubmission } from "./add-time-dialog";
import { addSessionTime, setSessionNotes, setSessionStatus, type SessionActionResult } from "./session-actions";

const STATUS_TOAST: Record<SessionStatusAction, string> = {
  completed: "ทำเครื่องหมายเรียนเสร็จแล้ว",
  deferred: "ย้ายไปท้ายคิววันนี้แล้ว",
  skipped: "ข้ามรายการนี้แล้ว",
  pending: "เอากลับมาในคิวแล้ว",
};

export function TodayView({
  workspace,
  date,
  queue,
}: {
  workspace: Workspace;
  date: string;
  queue: TodayStudyQueue;
}) {
  const { toast } = useToast();

  // ---- local state, seeded from the server and reset when the server sends a
  //      new payload (navigation back to /today, another action's refresh) ----
  const [serverQueue, setServerQueue] = useState(queue);
  const [sessions, setSessions] = useState<StudySessionVM[]>(queue.sessions);
  const [customItems, setCustomItems] = useState<CustomStudyItem[]>(queue.customItems);
  if (queue !== serverQueue) {
    setServerQueue(queue);
    setSessions(queue.sessions);
    setCustomItems(queue.customItems);
  }
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  const [openAddCustom, setOpenAddCustom] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomStudyItem | null>(null);

  const setPending = useCallback((key: string, on: boolean) => {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  /**
   * Optimistic mutation: patch local state immediately, persist, then merge
   * the server's patch. On failure restore that one card and toast.
   */
  const mutate = useCallback(
    async (
      key: string,
      optimistic: SessionPatch,
      run: () => Promise<SessionActionResult>,
      successTitle?: string
    ) => {
      const before = sessionsRef.current.find((s) => s.key === key);
      if (!before) return;
      setSessions((prev) => applySessionPatch(prev, key, optimistic));
      setPending(key, true);
      let res: SessionActionResult;
      try {
        res = await run();
      } catch (err) {
        res = { ok: false, error: err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ" };
      }
      setPending(key, false);
      if (!res.ok) {
        setSessions((prev) => replaceSession(prev, key, before));
        toast({ variant: "error", title: "บันทึกไม่สำเร็จ", description: res.error });
        return;
      }
      if (res.patch) setSessions((prev) => applySessionPatch(prev, key, res.patch!));
      if (successTitle) {
        toast({ variant: "success", title: successTitle, description: res.message });
      }
    },
    [setPending, toast]
  );

  const handlers = useMemo<StudySessionCardHandlers>(
    () => ({
      onAddTime(session, submission: AddTimeSubmission) {
        const entries: SessionHistoryEntry[] = submission.intervals.map((iv, i) => ({
          id: `optimistic-${Date.now()}-${i}`,
          sessionDate: date,
          startTime: iv.start,
          endTime: iv.end,
          durationMinutes: 0,
          note: submission.note ?? null,
        }));
        // Spread the validated total across entries for the optimistic view.
        if (entries.length > 0) entries[0]!.durationMinutes = submission.totalMinutes;
        void mutate(
          session.key,
          optimisticAddTime(session, entries),
          () =>
            addSessionTime({
              source: session.source,
              sessionDate: date,
              intervals: submission.intervals,
              note: submission.note,
            }),
          "บันทึกเวลาแล้ว"
        );
      },
      onStatus(session, action) {
        void mutate(
          session.key,
          optimisticStatus(session, action, new Date().toISOString()),
          () => setSessionStatus({ source: session.source, action, date }),
          STATUS_TOAST[action]
        );
      },
      onNotes(session, notes) {
        void mutate(
          session.key,
          { notes: notes || null },
          () => setSessionNotes({ source: session.source, notes }),
          "บันทึกหมายเหตุแล้ว"
        );
      },
      onEdit(session) {
        const item = customItems.find((c) => c.id === session.source.id);
        if (item) setEditingItem(item);
      },
      onDelete(session) {
        if (!window.confirm(`ต้องการลบ "${session.title}" หรือไม่?`)) return;
        const snapshot = sessionsRef.current;
        setSessions((prev) => removeSession(prev, session.key));
        void deleteCustomStudyItem({ id: session.source.id }).then(
          (res) => {
            if (res.ok) {
              setCustomItems((prev) => prev.filter((c) => c.id !== session.source.id));
              toast({ variant: "success", title: "ลบรายการแล้ว" });
            } else {
              setSessions(snapshot);
              toast({ variant: "error", title: "ลบไม่สำเร็จ", description: res.error });
            }
          },
          () => {
            setSessions(snapshot);
            toast({ variant: "error", title: "ลบไม่สำเร็จ", description: "เชื่อมต่อไม่สำเร็จ" });
          }
        );
      },
    }),
    [customItems, date, mutate, toast]
  );

  function onCustomSaved(item: CustomStudyItem) {
    setCustomItems((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      return exists ? prev.map((c) => (c.id === item.id ? item : c)) : [...prev, item];
    });
    setSessions((prev) => {
      const key = `custom:${item.id}`;
      const existing = prev.find((s) => s.key === key);
      if (existing) return replaceSession(prev, key, applyCustomItemToSession(existing, item));
      const order = 10_000 + prev.filter((s) => s.source.kind === "custom").length;
      return [...prev, buildCustomSessionVM({ item, sessions: [], order })];
    });
  }

  // ---- header numbers (live: follow optimistic state) ----------------------
  const minutesFromCards = (list: readonly StudySessionVM[]) =>
    list.reduce(
      (sum, s) => sum + s.history.filter((h) => h.sessionDate === date).reduce((a, h) => a + h.durationMinutes, 0),
      0
    );
  const baseMinutesElsewhere = queue.summary.actualMinutesToday - minutesFromCards(queue.sessions);
  const actualMinutesToday = Math.max(0, baseMinutesElsewhere) + minutesFromCards(sessions);

  const targetMinutes =
    queue.summary.plannedTargetMinutes > 0
      ? queue.summary.plannedTargetMinutes
      : workspace.daily_target_minutes;
  const remainingMinutes = Math.max(0, targetMinutes - actualMinutesToday);
  const targetPercent =
    targetMinutes > 0 ? Math.min(100, Math.round((actualMinutesToday / targetMinutes) * 100)) : 0;

  const groups = groupStudyQueue(sessions);
  const counts = summarizeStudyQueue(sessions);
  const hasAnyContent = sessions.length > 0 || queue.supplementary.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- compact header ------------------------------------------------ */}
      <header className="rounded-lg border border-border bg-card p-3 md:px-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">วันนี้</h1>
            <p className="truncate text-xs text-muted-foreground">
              {formatDateKeyThai(date, { buddhist: true })}
              {queue.version ? ` · ${queue.version.name} (v${queue.version.version_number})` : " · ยังไม่มีแผนที่ active"}
            </p>
          </div>

          <dl className="order-last grid w-full grid-cols-3 gap-x-3 text-sm tabular-nums sm:order-none sm:flex sm:w-auto sm:flex-1 sm:items-center sm:gap-x-5">
            <HeaderStat
              label="เรียนแล้ว / เป้าหมาย"
              value={`${actualMinutesToday}/${targetMinutes} นาที`}
            />
            <HeaderStat
              label="เหลือ"
              value={remainingMinutes === 0 ? "ครบเป้าแล้ว" : `${remainingMinutes} นาที`}
              tone={remainingMinutes === 0 ? "good" : undefined}
            />
            <HeaderStat
              label="Session เสร็จ"
              value={`${counts.completedSessions} / ${counts.totalSessions}`}
            />
          </dl>

          <Button size="sm" onClick={() => setOpenAddCustom(true)} className="shrink-0">
            <Plus className="h-4 w-4" aria-hidden="true" />
            เพิ่มการเรียนเอง
          </Button>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Progress value={targetPercent} className="h-1.5" />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {targetPercent}%
          </span>
        </div>
      </header>

      {queue.queueError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          โหลดคิวการเรียนไม่สมบูรณ์: {queue.queueError}
        </p>
      ) : null}

      {!hasAnyContent ? (
        <EmptyState
          title={
            queue.queueState === "completed"
              ? "เรียนจบแผนการเรียนทั้งหมดแล้ว 🎉"
              : "ยังไม่มีรายการในคิวการเรียน"
          }
          description={
            queue.queueState === "completed"
              ? "คุณเรียนครบทุกรายการในแผนการเรียนที่ active เรียบร้อยแล้ว ยอดเยี่ยมมาก!"
              : queue.version
                ? "ยังไม่มีรายการที่ต้องเรียน สามารถกดเพิ่มการเรียนเองสำหรับวันนี้ได้"
                : "ยังไม่มีแผนที่ active — กรุณานำเข้าและเปิดใช้แผนการเรียน"
          }
          action={
            <div className="flex gap-2">
              <Button onClick={() => setOpenAddCustom(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                เพิ่มการเรียนเอง
              </Button>
              <Link href="/imports">
                <Button variant="outline">นำเข้าแผน</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* ---- learning queue --------------------------------------------- */}
          <section aria-labelledby="queue-heading">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 id="queue-heading" className="text-sm font-semibold text-muted-foreground">
                ลำดับการเรียนวันนี้ ({groups.active.length + groups.deferred.length})
              </h2>
              {counts.deferredSessions > 0 ? (
                <span className="text-xs text-muted-foreground">
                  เลื่อนไว้ทำทีหลัง {counts.deferredSessions} รายการ
                </span>
              ) : null}
            </div>

            {groups.active.length === 0 && groups.deferred.length === 0 ? (
              <Card className="border-emerald-500/40 bg-emerald-500/5">
                <CardContent className="flex items-center gap-3 pb-4 pt-4">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                      {queue.queueState === "completed"
                        ? "เรียนครบทุกรายการในแผนแล้ว"
                        : "คิวของวันนี้ว่างแล้ว"}
                    </p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                      ทบทวน หรือเพิ่มการเรียนเสริมต่อได้เลย
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {groups.active.map((s) => (
                  <StudySessionCard
                    key={s.key}
                    session={s}
                    pending={pendingKeys.has(s.key)}
                    handlers={handlers}
                  />
                ))}
                {groups.deferred.length > 0 ? (
                  <div className="col-span-full mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    ถัดไป · เลื่อนไว้ทำทีหลัง ({groups.deferred.length})
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : null}
                {groups.deferred.map((s) => (
                  <StudySessionCard
                    key={s.key}
                    session={s}
                    pending={pendingKeys.has(s.key)}
                    handlers={handlers}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ---- done today --------------------------------------------------- */}
          {groups.done.length > 0 ? (
            <section aria-labelledby="done-heading">
              <h2 id="done-heading" className="mb-2 text-sm font-semibold text-muted-foreground">
                เสร็จแล้ว / ข้าม วันนี้ ({groups.done.length})
              </h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {groups.done.map((s) => (
                  <StudySessionCard
                    key={s.key}
                    session={s}
                    pending={pendingKeys.has(s.key)}
                    handlers={handlers}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <ReviewSection reviews={queue.supplementary} />
        </div>
      )}

      <CustomStudyDialog
        open={openAddCustom}
        onOpenChange={setOpenAddCustom}
        date={date}
        onSaved={onCustomSaved}
      />
      <CustomStudyDialog
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        date={date}
        item={editingItem}
        onSaved={(item) => {
          onCustomSaved(item);
          setEditingItem(null);
        }}
      />
    </div>
  );
}

function HeaderStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] leading-4 text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "good"
            ? "truncate font-semibold text-emerald-600 dark:text-emerald-400"
            : "truncate font-semibold"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ReviewSection({ reviews }: { reviews: ReviewTask[] }) {
  if (reviews.length === 0) return null;
  return (
    <section aria-labelledby="review-heading">
      <div className="mb-2">
        <h2 id="review-heading" className="text-sm font-semibold text-muted-foreground">
          ทบทวน ({reviews.length})
        </h2>
        <p className="text-xs text-muted-foreground">งานทบทวน active ที่ถึงกำหนดแล้ว</p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
