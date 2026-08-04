"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UPLOAD_ACCEPT_ATTR,
  STORAGE_BUCKET,
  isAllowedMime,
  ALLOWED_EXT_BY_MIME,
  maxUploadBytes,
  formatBytes,
} from "@/lib/upload-constants";
import { parseFileName } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import { prepareUpload, finalizeUpload } from "./upload-actions";

type ItemStatus =
  | "pending"
  | "invalid"
  | "hashing"
  | "uploading"
  | "uploaded"
  | "skipped_duplicate"
  | "failed";

interface FileItem {
  id: string;
  file: File;
  status: ItemStatus;
  message?: string;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "รออัปโหลด",
  invalid: "ไม่ผ่านการตรวจสอบ",
  hashing: "กำลังตรวจสอบ…",
  uploading: "กำลังอัปโหลด…",
  uploaded: "อัปโหลดสำเร็จ",
  skipped_duplicate: "ข้าม (มีไฟล์เดิมแล้ว)",
  failed: "อัปโหลดไม่สำเร็จ",
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  pending: "text-muted-foreground",
  invalid: "text-destructive",
  hashing: "text-primary",
  uploading: "text-primary",
  uploaded: "text-primary",
  skipped_duplicate: "text-yellow-300",
  failed: "text-destructive",
};

function keyOf(f: File): string {
  return `${f.name}::${f.size}::${f.lastModified}`;
}

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

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
        if (existing.has(id)) continue;
        existing.add(id);
        const v = validate(file);
        next.push({ id, file, status: v.ok ? "pending" : "invalid", message: v.message });
      }
      return next;
    });
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
    const toUpload = items.filter((i) => i.status === "pending" || i.status === "failed");
    if (toUpload.length === 0) return;
    setSummary(null);

    startTransition(async () => {
      const supabase = createClient();
      let uploaded = 0;
      let skipped = 0;
      let failed = 0;

      for (const item of toUpload) {
        try {
          // 1) checksum in the browser (for dedup).
          setItem(item.id, { status: "hashing", message: undefined });
          const checksum = await sha256Hex(item.file);

          // 2) authorize + get a signed upload URL (or a duplicate verdict).
          const prep = await prepareUpload({
            originalFileName: item.file.name,
            mime: item.file.type,
            sizeBytes: item.file.size,
            checksum,
          });
          if (!prep.ok) {
            failed++;
            setItem(item.id, { status: "failed", message: prep.error });
            continue;
          }
          if (prep.mode === "duplicate") {
            skipped++;
            setItem(item.id, { status: "skipped_duplicate" });
            continue;
          }

          // 3) upload DIRECTLY to Supabase Storage (bypasses Vercel limits).
          setItem(item.id, { status: "uploading" });
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .uploadToSignedUrl(prep.path!, prep.token!, item.file, {
              contentType: item.file.type,
            });
          if (upErr) {
            failed++;
            setItem(item.id, { status: "failed", message: upErr.message });
            continue;
          }

          // 4) record metadata.
          const fin = await finalizeUpload({
            path: prep.path!,
            originalFileName: item.file.name,
            displayName: prep.displayName ?? item.file.name,
            extension: prep.extension ?? "",
            mime: item.file.type,
            sizeBytes: item.file.size,
            checksum,
          });
          if (!fin.ok) {
            failed++;
            setItem(item.id, { status: "failed", message: fin.error });
          } else if (fin.skippedDuplicate) {
            skipped++;
            setItem(item.id, { status: "skipped_duplicate" });
          } else {
            uploaded++;
            setItem(item.id, { status: "uploaded" });
          }
        } catch (e) {
          failed++;
          setItem(item.id, { status: "failed", message: (e as Error).message });
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
          อัตโนมัติ · อัปโหลดตรงไปยัง Storage รองรับไฟล์ขนาดใหญ่ (สูงสุด{" "}
          {Math.round(maxUploadBytes() / 1024 / 1024)}MB ต่อไฟล์)
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
                      <span className={STATUS_CLASS[item.status]}> · {item.message}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-xs ${STATUS_CLASS[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  {item.status !== "uploading" && item.status !== "hashing" ? (
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
