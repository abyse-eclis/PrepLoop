"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { uploadSourceFile, type UploadResult } from "./upload-actions";

export function Uploader() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await uploadSourceFile(fd);
      setResult(res);
      if (res.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>อัปโหลดไฟล์แหล่งเรียน (ส่วนตัว)</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">ชื่อไฟล์ (แสดงผล)</Label>
            <Input id="title" name="title" placeholder="เช่น A-Level คณิต 1 ชุดที่ 1" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">ไฟล์ (PDF, PNG, JPEG, JSON)</Label>
            <input
              id="file"
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,application/json"
              required
              className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
            />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังอัปโหลด…" : "อัปโหลด"}
            </Button>
          </div>
          {result ? (
            <p
              className={
                result.ok ? "text-sm text-primary" : "text-sm text-destructive"
              }
            >
              {result.message ?? result.error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
