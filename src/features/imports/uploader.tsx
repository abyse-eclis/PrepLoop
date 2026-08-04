"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UPLOAD_ACCEPT_ATTR,
  resolveUploadMime,
  formatBytes,
} from "@/lib/upload-constants";
import { registerSourceFile } from "./upload-actions";

type ItemStatus =
  | "pending"
  | "invalid"
  | "saving"
  | "saved"
  | "skipped_duplicate"
  | "failed";

interface FileItem {
  id: string;
  file: File;
  status: ItemStatus;
  message?: string;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "รอบันทึก",
  invalid: "ไม่รองรับ",
  saving: "กำลังบันทึก…",
  saved: "บันทึกชื่อไฟล์แล้ว",
  skipped_duplicate: "ข้าม (มีชื่อนี้แล้ว)",
  failed: "บันทึกไม่สำเร็จ",
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  pending: "text-muted-foreground",
  invalid: "text-destructive",
  saving: "text-primary",
  saved: "text-primary",
  skipped_duplicate: "text-yellow-300",
  failed: "text-destructive",
};

function keyOf(f: File): string {
  return `${f.name}::${f.size}::${f.lastModified}`;
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
        if (existing.has(id)) continue; // dedup by name+size+lastModified
        existing.add(id);
        const supported = resolveUploadMime(file.type, file.name) !== null;
        next.push({
          id,
          file,
          status: supported ? "pending" : "invalid",
          message: supported ? undefined : "ชนิดไฟล์ไม่รองรับ (PDF, PNG, JPEG, JSON, MD)",
        });
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

  function saveAll() {
    const toSave = items.filter(
      (i) => i.status === "pending" || i.status === "failed"
    );
    if (toSave.length === 0) return;
    setSummary(null);

    startTransition(async () => {
      let saved = 0;
      let skipped = 0;
      let failed = 0;

      for (const item of toSave) {
        setItem(item.id, { status: "saving", message: undefined });
        try {
          const res = await registerSourceFile({
            originalFileName: item.file.name,
            mime: item.file.type,
            sizeBytes: item.file.size,
          });
          if (!res.ok) {
            failed++;
            setItem(item.id, { status: "failed", message: res.error });
          } else if (res.skippedDuplicate) {
            skipped++;
            setItem(item.id, { status: "skipped_duplicate" });
          } else {
            saved++;
            setItem(item.id, { status: "saved" });
          }
        } catch (e) {
          failed++;
          setItem(item.id, { status: "failed", message: (e as Error).message });
        }
      }

      setSummary(
        `เลือก ${toSave.length} ไฟล์ · บันทึก ${saved} · ข้าม ${skipped} · ล้มเหลว ${failed}`
      );
      router.refresh();
    });
  }

  const saveable = items.filter(
    (i) => i.status === "pending" || i.status === "failed"
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>เพิ่มไฟล์แหล่งเรียน (เก็บชื่อไว้อ้างอิง)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          เลือกได้หลายไฟล์พร้อมกัน (PDF, PNG, JPEG, JSON, MD) ระบบเก็บ
          <span className="text-foreground"> เฉพาะชื่อไฟล์ไว้อ้างอิง</span> —
          ไม่อัปโหลดไฟล์จริงขึ้น Storage จึงไม่มีข้อจำกัดขนาดไฟล์
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
            onClick={saveAll}
            disabled={saveable === 0 || pending}
          >
            {pending ? "กำลังบันทึก…" : `บันทึกทั้งหมด (${saveable})`}
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
                  {item.status !== "saving" ? (
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
