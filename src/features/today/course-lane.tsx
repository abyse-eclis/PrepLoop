"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  History,
  MoreHorizontal,
  Pause,
  PencilLine,
  Play,
  ShoppingCart,
  SkipForward,
  Timer,
  Undo2,
  Youtube,
} from "lucide-react";
import { Badge, Progress } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/status";
import type { PlanItemStatus } from "@/lib/schemas/common";
import {
  EXECUTION_STATE_CLASS,
  EXECUTION_STATE_LABELS,
} from "@/lib/study-execution";
import type { CourseLaneCard, LaneKey } from "@/lib/today/course-lanes";
import {
  MAX_CARD_BADGES,
  RESOURCE_OPEN_LABELS,
  resourceBadges,
  type BadgeTone,
} from "@/lib/resources/presentation";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_STATUS_CLASS,
  type ResourceStatus,
  type ResourceType,
} from "@/lib/resources/types";
import { setItemStatus } from "@/features/sessions/actions";
import { studyNow } from "@/features/today/actions";
import { setStudyResourceStatus } from "@/features/resources/actions";
import { AddTimeForm } from "@/features/sessions/add-time-form";

const TYPE_ICON: Record<ResourceType, typeof BookOpen> = {
  COURSE: BookOpen,
  YOUTUBE: Youtube,
  DOCUMENT: FileText,
  WEBSITE: Globe,
  PRACTICE: PencilLine,
  MOCK: Timer,
};

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  accent:
    "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  warning:
    "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  danger: "bg-destructive/10 text-destructive",
};

const LANE_STYLE: Record<
  LaneKey,
  {
    icon: typeof ShoppingCart;
    title: string;
    description: string;
    iconWrap: string;
    count: string;
    card: string;
    empty: string;
  }
> = {
  PAID: {
    icon: ShoppingCart,
    title: "คอร์สที่ซื้อมา",
    description: "คอร์สที่มีสิทธิ์เรียนและมีวันหมดอายุ",
    iconWrap: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    count: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
    card: "border-sky-500/25",
    empty: "ยังไม่มีคอร์สที่ซื้อมาในแผนวันนี้",
  },
  FREE: {
    icon: GraduationCap,
    title: "คอร์สฟรี",
    description: "บทเรียนฟรีสำหรับปูพื้น เสริม และทบทวน",
    iconWrap: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    count:
      "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    card: "border-violet-500/25",
    empty: "ยังไม่มีแหล่งเรียนฟรีในแผนวันนี้",
  },
  OTHER: {
    icon: Timer,
    title: "รายการอื่นในแผนวันนี้",
    description: "งานที่ยังไม่ได้ผูกกับแหล่งเรียน เช่น ชุดข้อสอบหรือการทบทวน",
    iconWrap: "bg-muted text-muted-foreground",
    count: "bg-muted text-muted-foreground",
    card: "border-border",
    empty: "ไม่มีรายการอื่น",
  },
};

/**
 * Today's two learning streams, side by side on desktop.
 *
 * Purchased courses on the left, free sources on the right — every resource
 * planned for today is its own card in one of the lanes. The lanes are
 * independent: they carry different numbers of cards and never pair up.
 */
export function CourseLaneGrid({
  paid,
  free,
  other,
  date,
  today,
}: {
  paid: CourseLaneCard[];
  free: CourseLaneCard[];
  other: CourseLaneCard[];
  date: string;
  today: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CourseLane lane="PAID" cards={paid} date={date} today={today} />
        <CourseLane lane="FREE" cards={free} date={date} today={today} />
      </div>

      {other.length > 0 ? (
        <CourseLane lane="OTHER" cards={other} date={date} today={today} />
      ) : null}
    </div>
  );
}

export function CourseLane({
  lane,
  cards,
  date,
  today,
}: {
  lane: LaneKey;
  cards: CourseLaneCard[];
  date: string;
  today: string;
}) {
  const style = LANE_STYLE[lane];
  const LaneIcon = style.icon;

  return (
    <section aria-label={style.title} className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.iconWrap}`}
          >
            <LaneIcon className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {style.title}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {style.description}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${style.count}`}
        >
          {cards.length} รายการ
        </span>
      </header>

      <div className="flex flex-col gap-3">
        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {style.empty}
          </p>
        ) : (
          cards.map((card) => (
            <StudyCourseCard
              key={card.key}
              card={card}
              accentClassName={style.card}
              date={date}
              today={today}
            />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * One learning card: a course, a clip, a document — whatever today's plan says
 * to study from, with the timer of the plan item it belongs to.
 */
export function StudyCourseCard({
  card,
  accentClassName,
  date,
  today,
}: {
  card: CourseLaneCard;
  accentClassName: string;
  date: string;
  today: string;
}) {
  const [openMore, setOpenMore] = useState(false);
  const [openTime, setOpenTime] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { resource } = card;
  const isFree = card.lane === "FREE";
  const Icon = resource ? TYPE_ICON[resource.type] : Timer;
  const badges = resource
    ? resourceBadges(resource, today).slice(0, MAX_CARD_BADGES)
    : [];
  const isStudying =
    card.itemStatus === "studying" || card.executionState === "in_progress";
  const isSkipped = card.itemStatus === "skipped";

  function changeItemStatus(status: PlanItemStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setItemStatus({ planItemId: card.planItemId, status });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  function handleStudyNow() {
    setError(null);
    startTransition(async () => {
      const res = await studyNow({ planItemId: card.planItemId, date });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาดในการเริ่มเรียน");
    });
  }

  function changeResourceStatus(status: ResourceStatus) {
    if (!resource) return;
    setError(null);
    startTransition(async () => {
      const res = await setStudyResourceStatus({
        planItemId: card.planItemId,
        resourceId: resource.id,
        status,
      });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  const durationText = isFree
    ? resource?.durationMinutes
      ? `${resource.durationMinutes} นาที`
      : null
    : card.targetMinutes > 0
      ? `เป้าหมายวันนี้ ${card.targetMinutes} นาที`
      : null;

  return (
    <article
      className={`flex min-h-[150px] flex-col gap-3 rounded-xl border bg-card p-5 ${
        card.isCurrent && isStudying ? "border-primary/60" : accentClassName
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {subjectLabel(card.subject)} · {activityLabel(card.activityType)}
          </p>
          <div className="mt-1.5 flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="line-clamp-2 break-words text-lg font-semibold leading-snug">
                {card.title}
              </h3>
              {card.sourceLine ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {card.sourceLine}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isFree ? null : isStudying ? (
            <Badge className={EXECUTION_STATE_CLASS.in_progress}>
              {EXECUTION_STATE_LABELS.in_progress}
            </Badge>
          ) : card.isCurrent ? (
            <Badge className="bg-primary/10 text-primary">ถัดไป</Badge>
          ) : null}
          {isFree && resource ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                RESOURCE_STATUS_CLASS[resource.status]
              }`}
            >
              {RESOURCE_STATUS_LABELS[resource.status]}
            </span>
          ) : null}
        </div>
      </div>

      {durationText ? (
        <p className="text-sm text-muted-foreground">{durationText}</p>
      ) : null}

      {/* Paid work carries the plan item's timer; a clip does not need one. */}
      {!isFree && card.targetMinutes > 0 ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">ความคืบหน้า</span>
            <span className="font-medium tabular-nums">
              {card.actualMinutes} / {card.targetMinutes} นาที
            </span>
          </div>
          <Progress value={card.progressPercent} />
        </div>
      ) : null}

      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.key}
              title={badge.title}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                BADGE_TONE_CLASS[badge.tone]
              }`}
            >
              {badge.key === "mode" && badge.label === "ฟังผ่านได้" ? (
                <Headphones className="h-3 w-3" aria-hidden="true" />
              ) : null}
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      {card.isBlocked && card.blockedReason ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {card.blockedReason}
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {isFree && resource ? (
          <>
            <select
              value={resource.status}
              disabled={pending}
              onChange={(event) =>
                changeResourceStatus(event.target.value as ResourceStatus)
              }
              aria-label={`สถานะของ ${card.title}`}
              className={`h-9 rounded-md border-0 px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                RESOURCE_STATUS_CLASS[resource.status]
              }`}
            >
              {RESOURCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RESOURCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {resource.listenMode && resource.status !== "LISTENED" ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => changeResourceStatus("LISTENED")}
                title="ทำเครื่องหมายว่าฟังผ่านแล้ว (ไม่นับว่าเรียนจบ)"
              >
                <Headphones className="h-4 w-4" aria-hidden="true" />
                ฟังแล้ว
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              disabled={pending || card.isBlocked || isSkipped}
              onClick={handleStudyNow}
              variant={isStudying ? "secondary" : "default"}
              title={
                card.isBlocked
                  ? card.blockedReason
                  : "เริ่มเรียนรายการนี้และบันทึกเวลาเรียนทันที"
              }
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {isStudying ? "เรียนต่อ" : "เริ่มเรียน"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOpenMore((v) => !v)}
              aria-label={`ตัวเลือกเพิ่มเติมของ ${card.title}`}
              aria-expanded={openMore}
              title="ตัวเลือกเพิ่มเติม"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}

        {resource?.url ? (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`ml-auto ${buttonVariants({ variant: "outline" })}`}
            aria-label={`${RESOURCE_OPEN_LABELS[resource.type]} ${card.title} (เปิดแท็บใหม่)`}
            title={`${RESOURCE_OPEN_LABELS[resource.type]}ในแท็บใหม่`}
          >
            {RESOURCE_OPEN_LABELS[resource.type]}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {openMore ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {isStudying ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => changeItemStatus("paused")}
            >
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              พัก
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => changeItemStatus("completed")}
            title="ทำรายการนี้เสร็จแล้ว"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            เรียนเสร็จ
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenTime((v) => !v)}
            aria-expanded={openTime}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            เพิ่มเวลา
          </Button>
          <Button
            size="sm"
            variant={isSkipped ? "secondary" : "outline"}
            disabled={pending}
            onClick={() =>
              changeItemStatus(isSkipped ? "not_started" : "skipped")
            }
          >
            {isSkipped ? (
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isSkipped ? "เลิกข้าม" : "ข้าม"}
          </Button>
          <Link href={`/history?date=${date}`}>
            <Button size="sm" variant="ghost">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              ประวัติการเรียน
            </Button>
          </Link>
          {resource ? (
            <select
              value={resource.status}
              disabled={pending}
              onChange={(event) =>
                changeResourceStatus(event.target.value as ResourceStatus)
              }
              aria-label={`สถานะแหล่งเรียนของ ${card.title}`}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {RESOURCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RESOURCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {openTime ? (
        <div className="border-t border-border pt-3">
          <AddTimeForm
            planItemId={card.planItemId}
            sessionDate={date}
            onDone={() => setOpenTime(false)}
          />
        </div>
      ) : null}
    </article>
  );
}
