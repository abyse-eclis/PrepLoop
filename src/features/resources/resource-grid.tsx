"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  PencilLine,
  Plus,
  ShoppingCart,
  Timer,
  Trash2,
  Youtube,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_TIER_EMPTY_LABELS,
  RESOURCE_TIER_LABELS,
  type ResourceStatus,
  type ResourceTier,
  type ResourceType,
  type StudyResource,
} from "@/lib/resources/types";
import {
  MAX_CARD_BADGES,
  RESOURCE_OPEN_LABELS,
  resourceBadges,
  resourceDescription,
  resourceMetaLine,
  resourceSourceLine,
  statusBadge,
  type BadgeTone,
} from "@/lib/resources/presentation";
import { groupResourcesByTier } from "@/lib/resources/group";
import { ResourceDialog } from "./resource-dialog";
import { setStudyResourceStatus, deleteStudyResource } from "./actions";

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

/** Each lane keeps its own subtle accent so the two tiers read as separate. */
const LANE_STYLE: Record<
  ResourceTier,
  {
    icon: typeof ShoppingCart;
    description: string;
    section: string;
    header: string;
    iconWrap: string;
    count: string;
    card: string;
  }
> = {
  PAID: {
    icon: ShoppingCart,
    description: "คอร์สและเอกสารที่คุณมีสิทธิ์เรียน",
    section: "border-sky-500/25 bg-sky-500/[0.04] dark:bg-sky-400/[0.05]",
    header: "border-sky-500/20",
    iconWrap: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    count: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
    card: "border-sky-500/20 hover:border-sky-500/40",
  },
  FREE: {
    icon: GraduationCap,
    description: "แหล่งเรียนรู้ฟรีจาก YouTube และแหล่งอื่น ๆ",
    section:
      "border-violet-500/25 bg-violet-500/[0.04] dark:bg-violet-400/[0.05]",
    header: "border-violet-500/20",
    iconWrap: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    count:
      "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    card: "border-violet-500/20 hover:border-violet-500/40",
  },
};

/**
 * The two learning-resource lanes of one study topic.
 *
 * Purchased courses on the left, free sources on the right, each a full-height
 * section of its own rather than a small box nested in the study card. Both
 * lanes always render — an empty one keeps the two-sided mental model — and
 * they stack on anything narrower than xl so cards never get squeezed.
 *
 * Every link opens in a new tab: PrepLoop organises resources, it never plays
 * them.
 */
export function ResourceGrid({
  planItemId,
  resources,
  today,
  editable = true,
  className,
}: {
  planItemId: string;
  resources: StudyResource[];
  /** YYYY-MM-DD in the workspace timezone, for access expiry. */
  today: string;
  editable?: boolean;
  className?: string;
}) {
  const groups = groupResourcesByTier(resources);

  return (
    <div className={`grid grid-cols-1 gap-4 xl:grid-cols-2 ${className ?? ""}`}>
      <ResourceLane
        tier="PAID"
        planItemId={planItemId}
        resources={groups.paid}
        today={today}
        editable={editable}
      />
      <ResourceLane
        tier="FREE"
        planItemId={planItemId}
        resources={groups.free}
        today={today}
        editable={editable}
      />
    </div>
  );
}

export function ResourceLane({
  tier,
  planItemId,
  resources,
  today,
  editable = true,
}: {
  tier: ResourceTier;
  planItemId: string;
  resources: StudyResource[];
  today: string;
  editable?: boolean;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const style = LANE_STYLE[tier];
  const LaneIcon = style.icon;
  const title = RESOURCE_TIER_LABELS[tier];

  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col rounded-xl border ${style.section}`}
    >
      <header
        className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 ${style.header}`}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.iconWrap}`}
          >
            <LaneIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {style.description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${style.count}`}
          >
            {resources.length} รายการ
          </span>
          {editable ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => setOpenAdd(true)}
              title={`เพิ่มแหล่งเรียนใน${title}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              เพิ่ม
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {resources.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {RESOURCE_TIER_EMPTY_LABELS[tier]}
            </p>
            {editable ? (
              <Button size="sm" variant="outline" onClick={() => setOpenAdd(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                เพิ่มแหล่งเรียน
              </Button>
            ) : null}
          </div>
        ) : (
          resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              planItemId={planItemId}
              today={today}
              accentClassName={style.card}
              editable={editable}
            />
          ))
        )}
      </div>

      {editable ? (
        <ResourceDialog
          open={openAdd}
          onOpenChange={setOpenAdd}
          planItemId={planItemId}
          defaultTier={tier}
        />
      ) : null}
    </section>
  );
}

export function ResourceCard({
  resource,
  planItemId,
  today,
  accentClassName,
  editable = true,
}: {
  resource: StudyResource;
  planItemId: string;
  today: string;
  accentClassName?: string;
  editable?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState(false);

  const Icon = TYPE_ICON[resource.type];
  const sourceLine = resourceSourceLine(resource);
  const description = resourceDescription(resource);
  const metaLine = resourceMetaLine(resource);
  const badges = resourceBadges(resource, today).slice(0, MAX_CARD_BADGES);
  const status = statusBadge(resource);

  function changeStatus(next: ResourceStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setStudyResourceStatus({
        planItemId,
        resourceId: resource.id,
        status: next,
      });
      if (!res.ok) setError(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteStudyResource({ id: resource.id });
      if (!res.ok) setError(res.error ?? "ลบไม่สำเร็จ");
    });
  }

  return (
    <article
      className={`rounded-lg border bg-card p-4 transition-colors ${
        accentClassName ?? "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-[15px] font-medium leading-snug">
            {resource.title}
          </h4>
          {sourceLine ? (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {sourceLine}
            </p>
          ) : null}
          {description ? (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          {metaLine ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{metaLine}</p>
          ) : null}
        </div>
      </div>

      {badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
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

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {/* The status control doubles as the status badge. */}
        <select
          value={resource.status}
          disabled={pending}
          onChange={(event) => changeStatus(event.target.value as ResourceStatus)}
          aria-label={`สถานะของ ${resource.title}`}
          className={`h-8 rounded-full border-0 px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${status.className}`}
        >
          {RESOURCE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {RESOURCE_STATUS_LABELS[value]}
            </option>
          ))}
        </select>

        {resource.listenMode && resource.status !== "LISTENED" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground"
            disabled={pending}
            onClick={() => changeStatus("LISTENED")}
            title="ทำเครื่องหมายว่าฟังผ่านแล้ว (ไม่นับว่าเรียนจบ)"
          >
            <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
            ฟังผ่านแล้ว
          </Button>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {editable && !resource.isLegacy ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground"
                onClick={() => setOpenEdit(true)}
                aria-label={`แก้ไข ${resource.title}`}
                title="แก้ไขแหล่งเรียน"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={remove}
                aria-label={`ลบ ${resource.title}`}
                title="ลบแหล่งเรียน"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : null}

          {resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label={`${RESOURCE_OPEN_LABELS[resource.type]} ${resource.title} (เปิดแท็บใหม่)`}
              title={`${RESOURCE_OPEN_LABELS[resource.type]}ในแท็บใหม่`}
            >
              {RESOURCE_OPEN_LABELS[resource.type]}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">ยังไม่มีลิงก์</span>
          )}
        </div>
      </div>

      {editable && !resource.isLegacy ? (
        <ResourceDialog
          open={openEdit}
          onOpenChange={setOpenEdit}
          planItemId={planItemId}
          resource={resource}
        />
      ) : null}
    </article>
  );
}
