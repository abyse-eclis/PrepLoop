"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSignedUrl, deleteSourceFile } from "./upload-actions";
import { formatBytes } from "@/lib/upload-constants";

export type SourceFileKind = "uploaded" | "catalog" | "reference";

export interface SourceFileRow {
  id: string;
  displayName: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
  kind: SourceFileKind;
}

const KIND_NOTE: Record<SourceFileKind, string> = {
  uploaded: "",
  catalog: " · (metadata จาก catalog)",
  reference: " · (อ้างอิง — ไม่มีไฟล์)",
};

export function FileList({
  files,
  timezone,
}: {
  files: SourceFileRow[];
  timezone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open(id: string) {
    setError(null);
    setBusyId(id);
    start(async () => {
      const res = await getSignedUrl(id);
      setBusyId(null);
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        setError(res.error ?? "เปิดไฟล์ไม่สำเร็จ");
      }
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`ลบไฟล์ "${name}" ? การลบจะเอาออกทั้ง Storage และฐานข้อมูล`)) {
      return;
    }
    setError(null);
    setBusyId(id);
    start(async () => {
      const res = await deleteSourceFile(id);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? "ลบไม่สำเร็จ");
    });
  }

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีไฟล์</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-1.5">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate">{f.displayName}</div>
              <div className="text-xs text-muted-foreground">
                {f.mimeType.split("/")[1] ?? f.mimeType}
                {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""} ·{" "}
                {new Date(f.createdAt).toLocaleDateString("th-TH", {
                  timeZone: timezone,
                })}
                {KIND_NOTE[f.kind]}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {f.kind === "uploaded" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending && busyId === f.id}
                  onClick={() => open(f.id)}
                >
                  เปิด
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending && busyId === f.id}
                onClick={() => remove(f.id, f.displayName)}
              >
                ลบ
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
