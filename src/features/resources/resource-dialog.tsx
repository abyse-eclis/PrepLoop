"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast";
import {
  RESOURCE_ACCESS_TYPE_LABELS,
  RESOURCE_ACCESS_TYPES,
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_TIER_LABELS,
  RESOURCE_TIERS,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceAccessType,
  type ResourceStatus,
  type ResourceTier,
  type ResourceType,
  type StudyResource,
} from "@/lib/resources/types";
import { createStudyResource, updateStudyResource } from "./actions";

/**
 * Add or edit one learning resource of a study item.
 *
 * A separate dialog rather than more fields on the plan form: an item can hold
 * several resources, and the plan itself stays an immutable imported version.
 */
export function ResourceDialog({
  open,
  onOpenChange,
  planItemId,
  resource,
  defaultTier = "FREE",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planItemId: string;
  resource?: StudyResource | null;
  defaultTier?: ResourceTier;
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [tier, setTier] = useState<ResourceTier>(defaultTier);
  const [type, setType] = useState<ResourceType>("COURSE");
  const [provider, setProvider] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [lessonFrom, setLessonFrom] = useState("");
  const [lessonTo, setLessonTo] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [accessType, setAccessType] = useState<ResourceAccessType | "">("");
  const [expiresAt, setExpiresAt] = useState("");
  const [limitedWatchTime, setLimitedWatchTime] = useState(false);
  const [listenMode, setListenMode] = useState(false);
  const [status, setStatus] = useState<ResourceStatus>("NOT_STARTED");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (resource) {
      setTier(resource.tier);
      setType(resource.type);
      setProvider(resource.provider ?? "");
      setTitle(resource.title);
      setUrl(resource.url ?? "");
      setCourseCode(resource.courseCode ?? "");
      setLessonFrom(resource.lessonFrom ?? "");
      setLessonTo(resource.lessonTo ?? "");
      setDurationMinutes(
        resource.durationMinutes ? String(resource.durationMinutes) : ""
      );
      setAccessType(resource.accessType ?? "");
      setExpiresAt(resource.expiresAt ?? "");
      setLimitedWatchTime(resource.limitedWatchTime);
      setListenMode(resource.listenMode);
      setStatus(resource.status);
    } else {
      setTier(defaultTier);
      setType(defaultTier === "PAID" ? "COURSE" : "YOUTUBE");
      setProvider(defaultTier === "FREE" ? "YouTube" : "");
      setTitle("");
      setUrl("");
      setCourseCode("");
      setLessonFrom("");
      setLessonTo("");
      setDurationMinutes("");
      setAccessType(defaultTier === "FREE" ? "FREE" : "EXPIRING");
      setExpiresAt("");
      setLimitedWatchTime(false);
      setListenMode(defaultTier === "FREE");
      setStatus("NOT_STARTED");
    }
    setError(null);
  }, [open, resource, defaultTier]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("กรุณากรอกชื่อแหล่งเรียน");
      return;
    }
    const cleanUrl = url.trim();
    if (cleanUrl && !/^https?:\/\/.+/i.test(cleanUrl)) {
      setError("URL ต้องขึ้นต้นด้วย http:// หรือ https://");
      return;
    }
    let minutes: number | null = null;
    if (durationMinutes.trim()) {
      minutes = Number.parseInt(durationMinutes, 10);
      if (Number.isNaN(minutes) || minutes < 0) {
        setError("ความยาวต้องเป็นตัวเลขนาที");
        return;
      }
    }

    const payload = {
      planItemId,
      tier,
      type,
      provider: provider.trim() || null,
      title: title.trim(),
      url: cleanUrl || null,
      courseCode: courseCode.trim() || null,
      lessonFrom: lessonFrom.trim() || null,
      lessonTo: lessonTo.trim() || null,
      durationMinutes: minutes,
      status,
      accessType: accessType || null,
      expiresAt: expiresAt || null,
      limitedWatchTime,
      listenMode,
    };

    startTransition(async () => {
      const res = resource
        ? await updateStudyResource({ ...payload, id: resource.id })
        : await createStudyResource(payload);
      if (res.ok) {
        toast({
          variant: "success",
          title: resource ? "บันทึกแหล่งเรียนแล้ว" : "เพิ่มแหล่งเรียนแล้ว",
        });
        onOpenChange(false);
        onSuccess?.();
      } else {
        setError(res.error ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={resource ? "แก้ไขแหล่งเรียน" : "เพิ่มแหล่งเรียน"}
      description="ระบุว่าหัวข้อนี้เรียนจากที่ไหน — คอร์สที่ซื้อมาหรือแหล่งเรียนฟรี (PrepLoop เก็บเป็นลิงก์ ไม่ได้เล่นวิดีโอในแอป)"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-tier">ประเภทสิทธิ์ *</Label>
            <Select
              id="resource-tier"
              value={tier}
              onChange={(event) => setTier(event.target.value as ResourceTier)}
            >
              {RESOURCE_TIERS.map((value) => (
                <option key={value} value={value}>
                  {RESOURCE_TIER_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-type">รูปแบบแหล่งเรียน *</Label>
            <Select
              id="resource-type"
              value={type}
              onChange={(event) => setType(event.target.value as ResourceType)}
            >
              {RESOURCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RESOURCE_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resource-title">ชื่อแหล่งเรียน *</Label>
          <Input
            id="resource-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="เช่น พิชิต A-Level คณิต 1 — จำนวนจริง"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-provider">ผู้สอน / แหล่งที่มา</Label>
            <Input
              id="resource-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="เช่น SmartMathPro, YouTube"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-course-code">รหัสคอร์ส</Label>
            <Input
              id="resource-course-code"
              value={courseCode}
              onChange={(event) => setCourseCode(event.target.value)}
              placeholder="เช่น M110"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resource-url">ลิงก์ (เปิดในแท็บใหม่)</Label>
          <Input
            id="resource-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-lesson-from">คลิป/บทเริ่ม</Label>
            <Input
              id="resource-lesson-from"
              value={lessonFrom}
              onChange={(event) => setLessonFrom(event.target.value)}
              placeholder="032"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-lesson-to">ถึง</Label>
            <Input
              id="resource-lesson-to"
              value={lessonTo}
              onChange={(event) => setLessonTo(event.target.value)}
              placeholder="035"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-duration">ความยาว (นาที)</Label>
            <Input
              id="resource-duration"
              type="number"
              min="0"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              placeholder="28"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-access-type">สิทธิ์การเข้าถึง</Label>
            <Select
              id="resource-access-type"
              value={accessType}
              onChange={(event) =>
                setAccessType(event.target.value as ResourceAccessType | "")
              }
            >
              <option value="">ไม่ระบุ</option>
              {RESOURCE_ACCESS_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RESOURCE_ACCESS_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-expires-at">วันหมดสิทธิ์</Label>
            <DatePicker
              id="resource-expires-at"
              value={expiresAt}
              onChange={setExpiresAt}
              clearable
              buddhist
              aria-label="วันหมดสิทธิ์"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={listenMode}
              onChange={(event) => setListenMode(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            เหมาะสำหรับเปิดฟัง (ฟังผ่านระหว่างทำงานอื่นได้)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={limitedWatchTime}
              onChange={(event) => setLimitedWatchTime(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            จำกัดเวลาเรียน
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resource-status">สถานะ</Label>
          <Select
            id="resource-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ResourceStatus)}
          >
            {RESOURCE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {RESOURCE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-muted-foreground">
            “ฟังผ่านแล้ว” ไม่นับว่าเรียนจบ และไม่เปลี่ยนสถานะของหัวข้อนี้
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            ยกเลิก
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "กำลังบันทึก…"
              : resource
                ? "บันทึกการแก้ไข"
                : "เพิ่มแหล่งเรียน"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
