"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import {
  previewPlanResourcesAction,
  repairPlanResourcesAction,
} from "./actions";
import type { RepairSummary, RepairItemDetail } from "./repair";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export function PlanResourceRepairPanel({
  versionId,
}: {
  versionId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [previewPending, startPreview] = useTransition();
  const [repairPending, startRepair] = useTransition();
  const [summary, setSummary] = useState<RepairSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handlePreview() {
    setError(null);
    setSuccessMsg(null);
    startPreview(async () => {
      const res = await previewPlanResourcesAction({ versionId });
      if (!res.ok || !res.summary) {
        setError(res.error ?? "ไม่สามารถดึงข้อมูลตรวจสอบได้");
        toast({
          variant: "error",
          title: "ตรวจสอบไม่สำเร็จ",
          description: res.error,
        });
        return;
      }
      setSummary(res.summary);
    });
  }

  function handleConfirmRepair() {
    setError(null);
    startRepair(async () => {
      const res = await repairPlanResourcesAction({ versionId });
      if (!res.ok || !res.summary) {
        setError(res.error ?? "ซ่อมแซมข้อมูลไม่สำเร็จ");
        toast({
          variant: "error",
          title: "ซ่อมแซมไม่สำเร็จ",
          description: res.error,
        });
        return;
      }
      setSummary(res.summary);
      setSuccessMsg(
        `ซ่อมแซมและกู้คืนสำเร็จ ${res.summary.repairedCount} รายการเรียบร้อยแล้ว`
      );
      toast({
        variant: "success",
        title: "ซ่อมแซม Learning Resources สำเร็จ",
        description: res.message,
      });
      router.refresh();
    });
  }

  const isWorking = previewPending || repairPending;
  const canRepair =
    summary &&
    (summary.restorableSafely > 0 || summary.canonicalResolvable > 0);

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            <CardTitle>ตรวจและซ่อม Learning Resources</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePreview}
            disabled={isWorking}
          >
            {previewPending ? "กำลังตรวจ..." : "ตรวจหา Resource ที่หายไป"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          ตรวจสอบรายการเรียนที่ไม่มีลิงก์วิดีโอ/แหล่งเรียน โดยจับคู่ความถูกต้องตามเนื้อหา
          (Semantic Identity) และแคตตาล็อกกลาง ป้องกันการดึงคลิปคนละหัวข้อจากเวอร์ชันเก่าเด็ดขาด
        </p>

        {error ? (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {successMsg ? (
          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-emerald-500">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        ) : null}

        {summary ? (
          <div className="space-y-4 rounded-md border border-border bg-accent/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <span className="font-semibold">ผลการตรวจสอบ Learning Resources</span>
              <span className="text-xs text-muted-foreground">
                พบรายการที่ไม่มี resource: {summary.totalChecked} รายการ
              </span>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-background p-2.5">
                <span className="text-xs text-muted-foreground">ซ่อมได้อย่างปลอดภัย</span>
                <p className="mt-0.5 text-lg font-bold text-emerald-500">
                  {summary.restorableSafely}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  เนื้อหาตรงกับ donor
                </span>
              </div>

              <div className="rounded-md border border-border bg-background p-2.5">
                <span className="text-xs text-muted-foreground">จาก Canonical Catalog</span>
                <p className="mt-0.5 text-lg font-bold text-sky-500">
                  {summary.canonicalResolvable}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  เช่น English / TGAT1
                </span>
              </div>

              <div className="rounded-md border border-border bg-background p-2.5">
                <span className="text-xs text-muted-foreground">ไม่มีที่ต้นทาง</span>
                <p className="mt-0.5 text-lg font-bold text-amber-500">
                  {summary.missingAtSource}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  รอการกำหนด Resource
                </span>
              </div>

              <div className="rounded-md border border-border bg-background p-2.5">
                <span className="text-xs text-muted-foreground">ขัดแย้ง (ห้ามซ่อม)</span>
                <p className="mt-0.5 text-lg font-bold text-rose-500">
                  {summary.conflictsBlocked}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  หัวข้อเปลี่ยนไป
                </span>
              </div>
            </div>

            {/* Sample Detailed Breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                ตัวอย่างรายการที่ตรวจพบ (แสดงสูงสุด 10 รายการ):
              </p>
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1 text-xs">
                {summary.details.slice(0, 10).map((d) => (
                  <DetailItemRow key={d.itemId} detail={d} />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              {canRepair ? (
                <Button
                  size="sm"
                  onClick={handleConfirmRepair}
                  disabled={repairPending}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  {repairPending ? "กำลังดำเนินการซ่อม..." : "ยืนยันซ่อม Resource ที่ปลอดภัย"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSummary(null)}
                disabled={isWorking}
              >
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailItemRow({ detail }: { detail: RepairItemDetail }) {
  const badgeMap: Record<
    RepairItemDetail["status"],
    { label: string; className: string }
  > = {
    restorable_safe: {
      label: "พร้อมกู้คืน",
      className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    canonical_resolved: {
      label: "Canonical",
      className: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    },
    missing_at_source: {
      label: "ไม่มีที่ต้นทาง",
      className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    },
    conflict_blocked: {
      label: "ขัดแย้ง (บล็อก)",
      className: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    },
  };

  const badge = badgeMap[detail.status];

  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="font-mono text-[11px] font-semibold text-foreground">
            {detail.subject}
          </span>
          <span className="truncate text-muted-foreground">
            · {detail.stableExternalId}
          </span>
        </div>
        <Badge className={`text-[10px] px-1.5 py-0 ${badge.className}`}>
          {badge.label}
        </Badge>
      </div>
      <p className="truncate text-muted-foreground">{detail.instructions}</p>
      {detail.restoredUrl ? (
        <div className="flex items-center gap-1 text-[11px] text-primary">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{detail.restoredLabel ?? detail.restoredUrl}</span>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground/80 italic">{detail.reason}</p>
    </div>
  );
}
