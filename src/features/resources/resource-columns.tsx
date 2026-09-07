"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Globe,
  Headphones,
  PencilLine,
  Plus,
  Timer,
  Trash2,
  Youtube,
} from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  RESOURCE_STATUS_CLASS,
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_TIER_EMPTY_LABELS,
  RESOURCE_TIER_LABELS,
  RESOURCE_TYPE_LABELS,
  type ResourceStatus,
  type ResourceTier,
  type ResourceType,
  type StudyResource,
} from "@/lib/resources/types";
import {
  groupResourcesByTier,
  summarizeResourceProgress,
} from "@/lib/resources/group";
import { describeAccess, EXPIRY_LEVEL_CLASS } from "@/lib/resources/expiry";
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

const OPEN_LABEL: Record<ResourceType, string> = {
  COURSE: "เปิดคอร์ส",
  YOUTUBE: "เปิด YouTube",
  DOCUMENT: "เปิดเอกสาร",
  WEBSITE: "เปิดลิงก์",
  PRACTICE: "เปิดแบบฝึกหัด",
  MOCK: "เปิดชุดข้อสอบ",
};

/**
 * The two resource columns of a study topic.
 *
 * Purchased courses on the left, free sources on the right; stacked on mobile
 * with the purchased column first. Both columns always render — an empty one
 * shows its own note so the two-sided structure stays visible.
 *
 * Every link opens in a new tab. PrepLoop never embeds or plays a resource.
 */
export function ResourceColumns({
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
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${className ?? ""}`}>
      <ResourceColumn
        tier="PAID"
        planItemId={planItemId}
        resources={groups.paid}
        today={today}
        editable={editable}
      />
      <ResourceColumn
        tier="FREE"
        planItemId={planItemId}
        resources={groups.free}
        today={today}
        editable={editable}
      />
    </div>
  );
}

export function ResourceColumn({
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
  const progress = summarizeResourceProgress(resources);

  return (
    <Card className="h-full">
      <CardHeader className="gap-1 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {RESOURCE_TIER_LABELS[tier]}
            {progress.total > 0 ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({progress.total})
              </span>
            ) : null}
          </h3>
          {editable ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setOpenAdd(true)}
              title={`เพิ่มแหล่งเรียนใน${RESOURCE_TIER_LABELS[tier]}`}
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่ม
            </Button>
          ) : null}
        </div>
        {progress.total > 0 ? (
          <p className="text-xs text-muted-foreground">
            เรียนแล้ว {progress.completed}/{progress.total}
            {progress.listened > 0
              ? ` · ฟังผ่านแล้ว ${progress.listened}`
              : ""}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {resources.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {RESOURCE_TIER_EMPTY_LABELS[tier]}
          </p>
        ) : (
          resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              planItemId={planItemId}
              today={today}
              editable={editable}
            />
          ))
        )}
      </CardContent>

      {editable ? (
        <ResourceDialog
          open={openAdd}
          onOpenChange={setOpenAdd}
          planItemId={planItemId}
          defaultTier={tier}
        />
      ) : null}
    </Card>
  );
}

export function ResourceCard({
  resource,
  planItemId,
  today,
  editable = true,
}: {
  resource: StudyResource;
  planItemId: string;
  today: string;
  editable?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const Icon = TYPE_ICON[resource.type];
  const access = describeAccess(resource, today);

  function changeStatus(status: ResourceStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setStudyResourceStatus({
        planItemId,
        resourceId: resource.id,
        status,
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

  const lessonRange = resource.lessonFrom
    ? resource.lessonTo && resource.lessonTo !== resource.lessonFrom
      ? `คลิป ${resource.lessonFrom}–${resource.lessonTo}`
      : `คลิป ${resource.lessonFrom}`
    : null;

  const metaLine = [
    resource.courseCode,
    lessonRange,
    resource.durationMinutes ? `${resource.durationMinutes} นาที` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {resource.provider ?? RESOURCE_TYPE_LABELS[resource.type]}
            </span>
          </div>
          <p className="mt-1 break-words text-sm font-medium">
            {resource.title}
          </p>
          {metaLine.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {metaLine.join(" · ")}
            </p>
          ) : null}
        </div>
        <Badge className={`shrink-0 ${RESOURCE_STATUS_CLASS[resource.status]}`}>
          {RESOURCE_STATUS_LABELS[resource.status]}
        </Badge>
      </div>

      {access.expiry ||
      access.accessLabel ||
      access.limitedWatchTimeLabel ||
      resource.listenMode ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {access.expiry ? (
            <span className={EXPIRY_LEVEL_CLASS[access.expiry.level]}>
              สิทธิ์: {access.expiry.label}
            </span>
          ) : null}
          {access.accessLabel ? (
            <span className="text-muted-foreground">{access.accessLabel}</span>
          ) : null}
          {access.limitedWatchTimeLabel ? (
            <span className="text-muted-foreground">
              {access.limitedWatchTimeLabel}
            </span>
          ) : null}
          {resource.listenMode ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
              เหมาะสำหรับเปิดฟัง
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {resource.url ? (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            title={`${OPEN_LABEL[resource.type]}ในแท็บใหม่`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {OPEN_LABEL[resource.type]}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">ยังไม่มีลิงก์</span>
        )}

        {resource.listenMode && resource.status !== "LISTENED" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={pending}
            onClick={() => changeStatus("LISTENED")}
            title="ฟังผ่านแล้ว — ไม่นับว่าเรียนจบ"
          >
            <Headphones className="h-3.5 w-3.5" />
            ฟังผ่านแล้ว
          </Button>
        ) : null}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only sm:not-sr-only">สถานะ</span>
          <select
            value={resource.status}
            disabled={pending}
            onChange={(event) =>
              changeStatus(event.target.value as ResourceStatus)
            }
            aria-label={`สถานะของ ${resource.title}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {RESOURCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RESOURCE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        {editable && !resource.isLegacy ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => setOpenEdit(true)}
              title="แก้ไขแหล่งเรียน"
            >
              <PencilLine className="h-3.5 w-3.5" />
              <span className="sr-only">แก้ไขแหล่งเรียน</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              disabled={pending}
              onClick={remove}
              title="ลบแหล่งเรียน"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">ลบแหล่งเรียน</span>
            </Button>
          </>
        ) : null}
      </div>

      {editable && !resource.isLegacy ? (
        <ResourceDialog
          open={openEdit}
          onOpenChange={setOpenEdit}
          planItemId={planItemId}
          resource={resource}
        />
      ) : null}
    </div>
  );
}
