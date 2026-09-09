"use client";

import { memo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  SkipForward,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  Youtube,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, Progress } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Menu, MenuItem, MenuLink, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { formatDateKeyThai } from "@/lib/dates";
import {
  RESOURCE_KIND_LABELS,
  SESSION_STATUS_CLASS,
  SESSION_STATUS_LABELS,
  type ResourceKind,
  type SessionStatusAction,
  type StudySessionVM,
} from "@/lib/study-session";
import { AddTimeDialog, type AddTimeSubmission } from "./add-time-dialog";
import { NotesDialog } from "./notes-dialog";

const RESOURCE_ICON: Record<ResourceKind, typeof Link2> = {
  smartmathpro: Sparkles,
  youtube: Youtube,
  document: FileText,
  link: Link2,
};

export interface StudySessionCardHandlers {
  onAddTime: (session: StudySessionVM, submission: AddTimeSubmission) => void;
  onStatus: (session: StudySessionVM, action: SessionStatusAction) => void;
  onNotes: (session: StudySessionVM, notes: string) => void;
  onEdit?: (session: StudySessionVM) => void;
  onDelete?: (session: StudySessionVM) => void;
}

/**
 * The one card used for every study session — imported plan items and
 * self-added resources alike. The source only changes the badge, the icon and
 * the resource button; layout, actions and business rules are identical.
 *
 * Layout: a flexible content area followed by a fixed footer, so cards in a
 * grid row share the same height and their action bars line up.
 */
export const StudySessionCard = memo(function StudySessionCard({
  session,
  pending,
  handlers,
}: {
  session: StudySessionVM;
  pending: boolean;
  handlers: StudySessionCardHandlers;
}) {
  const [openTime, setOpenTime] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);

  const isCompleted = session.status === "completed";
  const isDeferred = session.status === "deferred";
  const isSkipped = session.status === "skipped";
  const isDone = isCompleted || isSkipped;
  const ResourceIcon = session.resource ? RESOURCE_ICON[session.resource.kind] : null;

  return (
    <>
      <Card
        className={cn(
          "flex h-full min-h-[16rem] flex-col",
          isDone ? "opacity-80" : "",
          isDeferred ? "border-dashed" : "",
          session.status === "in_progress" ? "border-primary/50 ring-1 ring-primary/15" : ""
        )}
        data-session-key={session.key}
        aria-busy={pending}
      >
        {/* ---- content ------------------------------------------------- */}
        <div className="flex flex-1 flex-col gap-1.5 p-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold">{session.subjectLabel}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium leading-4",
                  session.source.kind === "plan"
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                )}
              >
                {session.originLabel}
              </span>
              {session.resource && ResourceIcon ? (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
                  <ResourceIcon className="h-3 w-3" aria-hidden="true" />
                  {RESOURCE_KIND_LABELS[session.resource.kind]}
                </span>
              ) : null}
            </div>
            <Badge className={cn("shrink-0", SESSION_STATUS_CLASS[session.status])}>
              {SESSION_STATUS_LABELS[session.status]}
            </Badge>
          </div>

          <h3
            className={cn(
              "line-clamp-2 text-base font-semibold leading-snug",
              isSkipped ? "line-through text-muted-foreground" : ""
            )}
            title={session.title}
          >
            {session.title}
          </h3>

          <p className="line-clamp-1 text-xs text-muted-foreground" title={session.subtitle ?? undefined}>
            {session.subtitle ?? " "}
          </p>

          {session.instructions ? (
            <p className="line-clamp-2 text-xs text-muted-foreground/90">{session.instructions}</p>
          ) : null}

          {session.blockedReason ? (
            <div className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{session.blockedReason}</span>
            </div>
          ) : null}

          {session.notes ? (
            <button
              type="button"
              onClick={() => setOpenNotes(true)}
              className="flex items-start gap-1.5 rounded bg-muted/60 px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
              title="แก้หมายเหตุ"
            >
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{session.notes}</span>
            </button>
          ) : null}

          <div className="mt-auto pt-2">
            <div className="mb-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{session.actualMinutes}</span>
                {" / "}
                {session.plannedMinutes > 0 ? `${session.plannedMinutes} นาที` : "ไม่ระบุเวลา"}
              </span>
              <span>{session.progressPercent}%</span>
            </div>
            <Progress value={session.progressPercent} />
          </div>

          {openHistory ? (
            <div className="mt-2 rounded-md border border-border p-2">
              <p className="mb-1 text-xs font-medium">ประวัติการเรียน</p>
              {session.history.length === 0 ? (
                <p className="text-xs text-muted-foreground">ยังไม่มีประวัติการเรียน</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-xs tabular-nums text-muted-foreground">
                  {session.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap justify-between gap-x-2">
                      <span>
                        {formatDateKeyThai(h.sessionDate, { buddhist: true })} ·{" "}
                        {h.startTime ?? "--:--"}–{h.endTime ?? "--:--"}
                      </span>
                      <span>
                        {h.durationMinutes} นาที
                        {h.note ? ` · ${h.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {/* ---- footer: action bar (same place on every card) ------------- */}
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="px-2"
              disabled={pending}
              onClick={() => setOpenTime(true)}
              title="เพิ่มเวลาเรียนจริง"
            >
              <Plus className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
              เพิ่มเวลา
            </Button>

            <Button
              size="sm"
              variant={isCompleted ? "secondary" : "default"}
              className="px-2"
              disabled={pending}
              onClick={() => handlers.onStatus(session, isCompleted ? "pending" : "completed")}
              title={isCompleted ? "ยกเลิกสถานะเรียนเสร็จ" : "ทำรายการนี้เสร็จแล้ว"}
            >
              {isCompleted ? (
                <Undo2 className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
              ) : (
                <Check className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
              )}
              {isCompleted ? "เสร็จแล้ว" : "เรียนเสร็จ"}
            </Button>

            <Button
              size="sm"
              variant={isDeferred ? "secondary" : "outline"}
              className="px-2"
              disabled={pending || isDone}
              onClick={() => handlers.onStatus(session, isDeferred ? "pending" : "deferred")}
              title={
                isDeferred
                  ? "เอากลับมาเรียนตามลำดับเดิม"
                  : "ยังต้องเรียน แต่ขอทำอย่างอื่นก่อน — ย้ายไปท้ายคิววันนี้"
              }
            >
              {isDeferred ? (
                <Undo2 className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
              ) : (
                <ChevronRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
              )}
              {isDeferred ? "เอากลับ" : "ถัดไป"}
            </Button>

            <Menu
              label="เมนูเพิ่มเติม"
              trigger={
                <Button size="sm" variant="ghost" className="px-2" disabled={pending} title="เมนูเพิ่มเติม">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            >
              <MenuItem onClick={() => handlers.onStatus(session, isSkipped ? "pending" : "skipped")}>
                {isSkipped ? (
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isSkipped ? "เลิกข้าม" : "ข้าม (ไม่เรียนแล้ว)"}
              </MenuItem>
              <MenuItem onClick={() => setOpenNotes(true)}>
                <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                {session.notes ? "แก้หมายเหตุ" : "เพิ่มหมายเหตุ"}
              </MenuItem>
              <MenuItem onClick={() => setOpenHistory((v) => !v)}>
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                {openHistory ? "ซ่อนประวัติการเรียน" : `ประวัติการเรียน (${session.history.length})`}
              </MenuItem>
              {session.detailsHref || session.assessmentHref || session.editable ? <MenuSeparator /> : null}
              {session.detailsHref ? (
                <Link href={session.detailsHref} role="menuitem" data-menu-item className={menuLinkClass}>
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  ดูรายละเอียดในแผน
                </Link>
              ) : null}
              {session.assessmentHref ? (
                <Link href={session.assessmentHref} role="menuitem" data-menu-item className={menuLinkClass}>
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                  กรอกผลสอบ
                </Link>
              ) : null}
              {session.editable && handlers.onEdit ? (
                <MenuItem onClick={() => handlers.onEdit?.(session)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  แก้ไขรายละเอียด
                </MenuItem>
              ) : null}
              {session.editable && handlers.onDelete ? (
                <MenuItem destructive onClick={() => handlers.onDelete?.(session)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ลบรายการ
                </MenuItem>
              ) : null}
            </Menu>
          </div>

          {/* Resource link row — same height on every card. Opening a
              resource never changes the session's status. */}
          <div className="flex h-8 items-center">
            {session.resource ? (
              <a
                href={session.resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "px-2 text-primary")}
                title={
                  session.resource.sourceName
                    ? `${session.resource.label} · ${session.resource.sourceName}`
                    : session.resource.label
                }
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {session.resource.label}
                {session.resource.sourceName ? (
                  <span className="hidden max-w-[10rem] truncate text-xs font-normal text-muted-foreground sm:inline">
                    · {session.resource.sourceName}
                  </span>
                ) : null}
              </a>
            ) : session.missingResource ? (
              <span className="inline-flex items-center gap-1 rounded border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                ยังไม่ได้กำหนดแหล่งเรียน
              </span>
            ) : (
              <MenuLinkPlaceholder />
            )}
          </div>
        </div>
      </Card>

      <AddTimeDialog
        open={openTime}
        onOpenChange={setOpenTime}
        title={`${session.subjectLabel} · ${session.title}`}
        onSubmit={(submission) => handlers.onAddTime(session, submission)}
      />
      <NotesDialog
        open={openNotes}
        onOpenChange={setOpenNotes}
        title={`${session.subjectLabel} · ${session.title}`}
        initialNotes={session.notes}
        onSubmit={(notes) => handlers.onNotes(session, notes)}
      />
    </>
  );
});

const menuLinkClass =
  "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground";

function MenuLinkPlaceholder() {
  return <span className="px-2 text-xs text-muted-foreground">ไม่มีลิงก์แหล่งเรียน</span>;
}

// Re-exported so the view can render a plain anchor menu item when needed.
export { MenuLink };
