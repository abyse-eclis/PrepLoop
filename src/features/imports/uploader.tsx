"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UPLOAD_ACCEPT_ATTR,
  isAllowedMime,
  ALLOWED_EXT_BY_MIME,
  maxUploadBytes,
  formatBytes,
} from "@/lib/upload-constants";
import { parseFileName } from "@/lib/files";
import { uploadSingleSourceFile, type UploadStatus } from "./upload-actions";

type ItemStatus =
  | "pending"
  | "invalid"
  | "uploading"
  | "uploaded"
  | "skipped_duplicate"
  | "failed";

interface FileItem {
  id: string; // name::size::lastModified
  file: File;
  status: ItemStatus;
  message?: string;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "รออัปโหลด",
  invalid: "ไม่ผ่านการตรวจสอบ",
  uploading: "กำลังอัปโหลด…",
  uploaded: "อัปโหลดสำเร็จ",
  skipped_duplicate: "ข้าม (มีไฟล์เดิมแล้ว)",
  failed: "อัปโหลดไม่สำเร็จ",
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  pending: "text-muted-foreground",
  invalid: "text-destructive",
  uploading: "text-primary",
  uploaded: "text-primary",
  skipped_duplicate: "text-yellow-300",
  failed: "text-destructive",
};

function keyOf(f: File): string {
  return `${f.name}::${f.size}::${f.lastModified}`;
}

/** Client-side validation (mirrors the server; server remains authoritative). */
function validate(file: File): { ok: boolean; message?: string } {
  const mime = file.type;
  if (!isAllowedMime(mime)) {
    return { ok: false, message: `ชนิดไฟล์ไม่รองรับ (${mime || "unknown"})` };
  }
  const { extension } = parseFileName(file.name);
  if (extension && !ALLOWED_EXT_BY_MIME[mime]?.includes(extension)) {
    return { ok: false, message: `นามสกุล .${extension} ไม่ตรงกับชนิดไฟล์` };
  }
  const max = maxUploadBytes();
  if (file.size > max) {
    return { ok: false, message: `ใหญ่เกิน ${Math.round(max / 1024 / 1024)}MB` };
  }
  if (file.size === 0) return { ok: false, message: "ไฟล์ว่างเปล่า" };
  return { ok: true };
}

export function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setSummary(null);
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      const next = [...prev];
      for (const file of Array.from(fileList)) {
        const id = keyOf(file);
        if (existing.has(id)) continue; // client dedup by name+size+lastModified
        existing.add(id);
        const v = validate(file);
        next.push({
          id,
          file,
          status: v.ok ? "pending" : "invalid",
          message: v.message,
        });
      }
      return next;
    });
    // Allow re-selecting the same file again later.
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearAll() {
    setItems([]);
    setSummary(null);
  }

  function setItem(id: string, patch: Partial<FileItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function uploadAll() {
    const toUpload = items.filter(
      (i) => i.status === "pending" || i.status === "failed"
    );
    if (toUpload.length === 0) return;
    setSummary(null);

    startTransition(async () => {
      let uploaded = 0;
      let skipped = 0;
      let failed = 0;

      // Sequential: one request per file so a single failure never blocks the
      // rest, and each file gets an accurate status.
      for (const item of toUpload) {
        setItem(item.id, { status: "uploading", message: undefined });
        const fd = new FormData();
        fd.append("file", item.file);
        try {
          const res = await uploadSingleSourceFile(fd);
          const status = res.status as UploadStatus;
          if (status === "uploaded") uploaded++;
          else if (status === "skipped_duplicate") skipped++;
          else failed++;
          setItem(item.id, { status, message: res.error });
        } catch (e) {
          failed++;
          setItem(item.id, {
            status: "failed",
            message: (e as Error).message,
          });
        }
      }

      setSummary(
        `เลือก ${toUpload.length} ไฟล์ · สำเร็จ ${uploaded} · ข้าม ${skipped} · ล้มเหลว ${failed}`
      );
      router.refresh();
    });
  }

  const uploadable = items.filter(
    (i) => i.status === "pending" || i.status === "failed"
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>อัปโหลดไฟล์แหล่งเรียน (ส่วนตัว)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          เลือกได้หลายไฟล์พร้อมกัน (PDF, PNG, JPEG, JSON) ระบบใช้ชื่อไฟล์จริง
          อัตโนมัติ ไม่ต้องพิมพ์ชื่อเอง
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT_ATTR}
          onChange={(e) => addFiles(e.target.files)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            เลือกไฟล์เพิ่ม
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={items.length === 0 || pending}
          >
            ล้างรายการทั้งหมด
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={uploadAll}
            disabled={uploadable === 0 || pending}
          >
            {pending ? "กำลังอัปโหลด…" : `อัปโหลดทั้งหมด (${uploadable})`}
          </Button>
        </div>

        {items.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.file.type || "unknown"} · {formatBytes(item.file.size)}
                    {item.message ? (
                      <span className={STATUS_CLASS[item.status]}>
                        {" "}
                        · {item.message}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-xs ${STATUS_CLASS[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  {item.status !== "uploading" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(item.id)}
                    >
                      นำออก
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {summary ? <p className="text-sm text-primary">{summary}</p> : null}
      </CardContent>
    </Card>
  );
}
