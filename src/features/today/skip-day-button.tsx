"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setItemsStatus } from "@/features/sessions/actions";

/**
 * Skip every carried-over item from one planned day at once.
 *
 * A shifted schedule can strand a whole day of backlog, and clearing it one
 * card at a time is the tedious path. Two-step confirm guards the mis-tap;
 * undo is per item ("เลิกข้าม") in the skipped list below the section.
 */
export function SkipDayButton({ planItemIds }: { planItemIds: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (planItemIds.length === 0) return null;

  function skip() {
    startTransition(async () => {
      const res = await setItemsStatus({ planItemIds, status: "skipped" });
      if (!res.ok) {
        toast({
          variant: "error",
          title: "ข้ามไม่สำเร็จ",
          description: res.error,
        });
        return;
      }
      setConfirming(false);
      toast({
        variant: "success",
        title: `ข้าม ${planItemIds.length} รายการแล้ว`,
        description: "เอากลับมาได้ที่ “รายการที่ข้ามไว้” ด้านล่าง",
      });
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(true)}
        title="ข้ามงานค้างของวันนี้ทั้งหมด (ไม่นับเป็นงานค้างและไม่ตัดคะแนน)"
      >
        <SkipForward className="h-3.5 w-3.5" />
        ข้ามทั้งวัน
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        ข้าม {planItemIds.length} รายการของวันนี้?
      </span>
      <Button size="sm" variant="destructive" disabled={pending} onClick={skip}>
        {pending ? "กำลังข้าม…" : "ยืนยัน"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        ไม่ข้าม
      </Button>
    </span>
  );
}
