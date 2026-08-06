"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { activatePlanVersion } from "./actions";
import { requestRecovery, confirmRecovery } from "@/features/recovery/actions";
import type { RecoveryPlan } from "@/lib/schemas/recovery";

export function ActivateButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setMsg("กดอีกครั้งเพื่อยืนยัน แผนวันนี้ที่เริ่มดำเนินการแล้วจะไม่ถูกเปลี่ยน");
            return;
          }
          start(async () => {
            const res = await activatePlanVersion({ versionId });
            setMsg(res.ok ? res.message ?? "สำเร็จ" : res.error ?? "ผิดพลาด");
            toast(
              res.ok
                ? { variant: "success", title: "เปิดใช้งานแผนแล้ว", description: res.message }
                : { variant: "error", title: "เปิดใช้งานไม่สำเร็จ", description: res.error }
            );
            if (res.ok) router.refresh();
            setConfirming(false);
          })
        }}
      >
        {pending ? "กำลังเปิดใช้…" : confirming ? "ยืนยันใช้เวอร์ชันนี้" : "ใช้เวอร์ชันนี้"}
      </Button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}

export function RecoveryPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<{
    requestId: string;
    mode: "ai" | "mock";
    note?: string;
    plan: RecoveryPlan;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  function ask() {
    setError(null);
    setConfirmMsg(null);
    setPreview(null);
    start(async () => {
      const res = await requestRecovery();
      if (!res.ok || !res.plan || !res.requestId || !res.mode) {
        setError(res.error ?? "ขอ Recovery ไม่สำเร็จ");
        return;
      }
      setPreview({
        requestId: res.requestId,
        mode: res.mode,
        note: res.note,
        plan: res.plan,
      });
    });
  }

  function apply() {
    if (!preview) return;
    setConfirmMsg(null);
    start(async () => {
      const res = await confirmRecovery({ requestId: preview.requestId });
      if (res.ok) {
        setConfirmMsg(res.message ?? "สร้าง Plan V ใหม่แล้ว");
        setPreview(null);
        toast({ variant: "success", title: "สร้าง Recovery Plan แล้ว", description: res.message });
        router.refresh();
      } else {
        setError(res.error ?? "ยืนยันไม่สำเร็จ");
        toast({ variant: "error", title: "ยืนยันไม่สำเร็จ", description: res.error });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ขอ Recovery Plan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          เมื่อทำตามแผนไม่ได้หรือพบจุดอ่อน ระบบจะประเมินและสร้าง Recovery Plan
          เป็นเวอร์ชันใหม่ (เวอร์ชันเดิมยังคงอยู่และแก้ไม่ได้)
        </p>
        <div>
          <Button onClick={ask} disabled={pending} variant="secondary">
            {pending ? "กำลังประมวลผล…" : "ขอ Recovery"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {confirmMsg ? (
          <p className="text-sm text-primary">{confirmMsg}</p>
        ) : null}

        {preview ? (
          <div className="rounded-md border border-border bg-background p-3">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={
                  preview.mode === "mock"
                    ? "rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300"
                    : "rounded bg-primary/20 px-2 py-0.5 text-xs text-primary"
                }
              >
                {preview.mode === "mock" ? "MOCK (ไม่ใช่ AI จริง)" : "AI (Claude)"}
              </span>
              <span className="text-sm font-medium">ตัวอย่าง Recovery Plan</span>
            </div>
            {preview.note ? (
              <p className="mb-2 text-xs text-yellow-300">{preview.note}</p>
            ) : null}
            <p className="text-sm">
              <span className="text-muted-foreground">เหตุผล:</span>{" "}
              {preview.plan.reason}
            </p>
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">มีผลตั้งแต่:</span>{" "}
              {preview.plan.effectiveFrom}
            </p>
            {preview.plan.weakTopics.length > 0 ? (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">จุดอ่อน:</span>{" "}
                {preview.plan.weakTopics.join(", ")}
              </p>
            ) : null}

            <div className="mt-2 space-y-2">
              {preview.plan.days.map((d) => (
                <div key={d.date} className="rounded border border-border p-2">
                  <p className="text-xs font-medium">
                    {d.date} · {d.targetMinutes} นาที
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {d.items.map((it) => (
                      <li key={it.stableExternalId}>
                        • {it.subject} [{it.activityType}] {it.targetMinutes}น. —{" "}
                        {it.instructions}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {preview.plan.changes.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  ผลต่างจากแผนเดิม:
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {preview.plan.changes.map((c, i) => (
                    <li key={i}>
                      • [{c.action}] {c.sourceItemExternalId ?? ""} — {c.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.plan.riskNotes.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-xs text-yellow-300">
                {preview.plan.riskNotes.map((r, i) => (
                  <li key={i}>⚠ {r}</li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={apply} disabled={pending}>
                ยืนยันสร้าง Plan เวอร์ชันใหม่
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreview(null)}
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
